<script lang="ts">
  import { toastMessage } from "../controller";
</script>

<div id="toast" class:show={$toastMessage !== ""}>{$toastMessage}</div>
