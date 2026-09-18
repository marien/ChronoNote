//! Line-based three-way merge for note text.
//!
//! Notes are mostly appended to, so two devices adding lines (even at the
//! same spot) is the common divergence and should just keep both. Anything
//! where both sides touched the same existing lines is reported as a
//! conflict and left for the user to resolve.

#[derive(Debug, PartialEq, Eq)]
pub enum Merge {
    Clean(String),
    Conflict,
}

/// Replaces `base[start..end]` with `lines` (a pure insertion when
/// `start == end`, a pure deletion when `lines` is empty).
#[derive(Debug, PartialEq, Eq, Clone)]
struct Hunk {
    start: usize,
    end: usize,
    lines: Vec<String>,
}

/// Splits into lines that keep their `\n`, first guaranteeing a trailing
/// newline: without that, appending a line to a file that lacked one edits
/// its last line on both sides and looks like a conflict.
fn split_lines(s: &str) -> Vec<String> {
    let mut text = s.to_string();
    if !text.is_empty() && !text.ends_with('\n') {
        text.push('\n');
    }
    text.split_inclusive('\n').map(str::to_string).collect()
}

/// Above this many table cells the LCS is skipped (treated as a conflict)
/// rather than allocating hundreds of MB for a pathological note.
const MAX_LCS_CELLS: usize = 4_000_000;

fn hunks(base: &[String], new: &[String]) -> Option<Vec<Hunk>> {
    let n = base.len();
    let m = new.len();
    if n.saturating_mul(m) > MAX_LCS_CELLS {
        return None;
    }
    let w = m + 1;
    let mut t = vec![0u32; (n + 1) * w];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            t[i * w + j] = if base[i] == new[j] {
                t[(i + 1) * w + j + 1] + 1
            } else {
                t[(i + 1) * w + j].max(t[i * w + j + 1])
            };
        }
    }

    let (mut i, mut j) = (0, 0);
    let mut out = Vec::new();
    let mut cur: Option<Hunk> = None;
    while i < n || j < m {
        if i < n && j < m && base[i] == new[j] {
            if let Some(h) = cur.take() {
                out.push(h);
            }
            i += 1;
            j += 1;
        } else if j < m && (i == n || t[i * w + j + 1] >= t[(i + 1) * w + j]) {
            let h = cur.get_or_insert(Hunk { start: i, end: i, lines: vec![] });
            h.lines.push(new[j].clone());
            j += 1;
        } else {
            let h = cur.get_or_insert(Hunk { start: i, end: i, lines: vec![] });
            h.end = i + 1;
            i += 1;
        }
    }
    if let Some(h) = cur {
        out.push(h);
    }
    Some(out)
}

fn emit(out: &mut String, base: &[String], pos: &mut usize, h: &Hunk) -> Option<()> {
    if h.start < *pos {
        return None;
    }
    for line in &base[*pos..h.start] {
        out.push_str(line);
    }
    for line in &h.lines {
        out.push_str(line);
    }
    *pos = h.end;
    Some(())
}

/// Merges `local` and `remote`, both derived from `base`.
pub fn merge3(base: &str, local: &str, remote: &str) -> Merge {
    let b = split_lines(base);
    let (Some(hl), Some(hr)) = (hunks(&b, &split_lines(local)), hunks(&b, &split_lines(remote))) else {
        return Merge::Conflict;
    };

    let mut out = String::new();
    let mut pos = 0usize;
    let (mut li, mut ri) = (0usize, 0usize);
    loop {
        let step = match (hl.get(li), hr.get(ri)) {
            (None, None) => break,
            (Some(x), None) => {
                li += 1;
                emit(&mut out, &b, &mut pos, x)
            }
            (None, Some(y)) => {
                ri += 1;
                emit(&mut out, &b, &mut pos, y)
            }
            (Some(x), Some(y)) => {
                if x == y {
                    // Both sides made the identical change.
                    li += 1;
                    ri += 1;
                    emit(&mut out, &b, &mut pos, x)
                } else if x.start == x.end && y.start == y.end && x.start == y.start {
                    // Both added lines at the same spot: keep both (remote first).
                    li += 1;
                    ri += 1;
                    emit(&mut out, &b, &mut pos, y).and_then(|_| emit(&mut out, &b, &mut pos, x))
                } else {
                    let overlap = x.start < y.end && y.start < x.end;
                    let insert_inside = (x.start == x.end && y.start < x.start && x.start < y.end)
                        || (y.start == y.end && x.start < y.start && y.start < x.end);
                    if overlap || insert_inside {
                        return Merge::Conflict;
                    }
                    if (x.start, x.end) <= (y.start, y.end) {
                        li += 1;
                        emit(&mut out, &b, &mut pos, x)
                    } else {
                        ri += 1;
                        emit(&mut out, &b, &mut pos, y)
                    }
                }
            }
        };
        if step.is_none() {
            return Merge::Conflict;
        }
    }
    for line in &b[pos..] {
        out.push_str(line);
    }
    Merge::Clean(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_sides_appending_keeps_both() {
        let m = merge3("a\nb\n", "a\nb\nphone\n", "a\nb\npc\n");
        assert_eq!(m, Merge::Clean("a\nb\npc\nphone\n".to_string()));
    }

    #[test]
    fn appending_to_a_file_without_a_trailing_newline_is_not_a_conflict() {
        let m = merge3("a\nb", "a\nb\nphone", "a\nb\npc");
        assert_eq!(m, Merge::Clean("a\nb\npc\nphone\n".to_string()));
    }

    #[test]
    fn edits_to_different_lines_merge() {
        let m = merge3("one\ntwo\nthree\n", "ONE\ntwo\nthree\n", "one\ntwo\nTHREE\n");
        assert_eq!(m, Merge::Clean("ONE\ntwo\nTHREE\n".to_string()));
    }

    #[test]
    fn editing_the_same_line_differently_is_a_conflict() {
        assert_eq!(merge3("one\ntwo\n", "one\nphone\n", "one\npc\n"), Merge::Conflict);
    }

    #[test]
    fn identical_edits_on_both_sides_merge_once() {
        let m = merge3("one\ntwo\n", "one\nsame\n", "one\nsame\n");
        assert_eq!(m, Merge::Clean("one\nsame\n".to_string()));
    }

    #[test]
    fn one_side_deleting_a_line_the_other_did_not_touch_merges() {
        let m = merge3("a\nb\nc\n", "a\nc\n", "a\nb\nc\nd\n");
        assert_eq!(m, Merge::Clean("a\nc\nd\n".to_string()));
    }

    #[test]
    fn deleting_a_line_the_other_side_edited_is_a_conflict() {
        assert_eq!(merge3("a\nb\nc\n", "a\nc\n", "a\nB\nc\n"), Merge::Conflict);
    }

    #[test]
    fn insertion_inside_a_range_the_other_side_rewrote_is_a_conflict() {
        assert_eq!(merge3("a\nb\nc\nd\n", "a\nb\nX\nc\nd\n", "a\nNEW\nd\n"), Merge::Conflict);
    }

    #[test]
    fn insertion_right_at_the_edge_of_a_rewritten_range_merges() {
        let m = merge3("a\nb\nc\nd\n", "a\nX\nb\nc\nd\n", "a\nNEW\nd\n");
        assert_eq!(m, Merge::Clean("a\nX\nNEW\nd\n".to_string()));
    }

    #[test]
    fn merging_into_an_empty_base_keeps_both() {
        let m = merge3("", "phone\n", "pc\n");
        assert_eq!(m, Merge::Clean("pc\nphone\n".to_string()));
    }

    #[test]
    fn an_unchanged_side_takes_the_others_edit() {
        let m = merge3("a\nb\n", "a\nb\n", "a\nB\n");
        assert_eq!(m, Merge::Clean("a\nB\n".to_string()));
    }
}
