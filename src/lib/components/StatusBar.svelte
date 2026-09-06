<script lang="ts">
  import { statusCounts, statusPos } from "../controller";
</script>

<div id="status-bar">
  <div class="status-group">
    <span id="stat-encoding">UTF-8</span>
    <span id="stat-pos">Ln {$statusPos.line}, Col {$statusPos.col}</span>
  </div>
  <div class="status-group">
    <span id="stat-open">Open: {$statusCounts.open}</span>
    <span id="stat-closed">Closed: {$statusCounts.closed}</span>
    <span id="stat-forwarded">Forwarded: {$statusCounts.forwarded}</span>
    <span style="opacity: 0.85;">[Ctrl+/] Shortcuts</span>
  </div>
</div>
