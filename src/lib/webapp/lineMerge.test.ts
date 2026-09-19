import { describe, it, expect } from 'vitest';
import { merge3 } from './lineMerge';

describe('lineMerge (3-way merge)', () => {
  it('both_sides_appending_keeps_both', () => {
    const m = merge3("a\nb\n", "a\nb\nphone\n", "a\nb\npc\n");
    expect(m).toEqual({ type: 'clean', content: "a\nb\npc\nphone\n" });
  });

  it('appending_to_a_file_without_a_trailing_newline_is_not_a_conflict', () => {
    const m = merge3("a\nb", "a\nb\nphone", "a\nb\npc");
    expect(m).toEqual({ type: 'clean', content: "a\nb\npc\nphone\n" });
  });

  it('edits_to_different_lines_merge', () => {
    const m = merge3("one\ntwo\nthree\n", "ONE\ntwo\nthree\n", "one\ntwo\nTHREE\n");
    expect(m).toEqual({ type: 'clean', content: "ONE\ntwo\nTHREE\n" });
  });

  it('editing_the_same_line_differently_is_a_conflict', () => {
    expect(merge3("one\ntwo\n", "one\nphone\n", "one\npc\n")).toEqual({ type: 'conflict' });
  });

  it('identical_edits_on_both_sides_merge_once', () => {
    const m = merge3("one\ntwo\n", "one\nsame\n", "one\nsame\n");
    expect(m).toEqual({ type: 'clean', content: "one\nsame\n" });
  });

  it('one_side_deleting_a_line_the_other_did_not_touch_merges', () => {
    const m = merge3("a\nb\nc\n", "a\nc\n", "a\nb\nc\nd\n");
    expect(m).toEqual({ type: 'clean', content: "a\nc\nd\n" });
  });

  it('deleting_a_line_the_other_side_edited_is_a_conflict', () => {
    expect(merge3("a\nb\nc\n", "a\nc\n", "a\nB\nc\n")).toEqual({ type: 'conflict' });
  });

  it('insertion_inside_a_range_the_other_side_rewrote_is_a_conflict', () => {
    expect(merge3("a\nb\nc\nd\n", "a\nb\nX\nc\nd\n", "a\nNEW\nd\n")).toEqual({ type: 'conflict' });
  });

  it('insertion_right_at_the_edge_of_a_rewritten_range_merges', () => {
    const m = merge3("a\nb\nc\nd\n", "a\nX\nb\nc\nd\n", "a\nNEW\nd\n");
    expect(m).toEqual({ type: 'clean', content: "a\nX\nNEW\nd\n" });
  });

  it('merging_into_an_empty_base_keeps_both', () => {
    const m = merge3("", "phone\n", "pc\n");
    expect(m).toEqual({ type: 'clean', content: "pc\nphone\n" });
  });

  it('an_unchanged_side_takes_the_others_edit', () => {
    const m = merge3("a\nb\n", "a\nb\n", "a\nB\n");
    expect(m).toEqual({ type: 'clean', content: "a\nB\n" });
  });
});
