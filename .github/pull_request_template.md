## Summary

<!-- What changed and why. Reference the issue (#NNN) if there is one. -->

## Checklist

- [ ] `shared/` contract changed → handlers registered for every new Action
      (tsc enforces the exhaustive registry) and the change is contract-reviewed
- [ ] `CardDef` shape changed → bumped the card-cache version key
      (`mtg:cards:vN` in `frontend/src/lib/cardCache.ts`)
- [ ] New game mechanic → keybind wired end to end (`KeybindId` + labels +
      `SHORTCUT_GROUPS` + handler slice in `GameTable` + `escape()` chain)
- [ ] Tests colocated (`actions/<domain>.test.ts`, `view.test.ts`,
      `table/foundation.test.ts`, `keybinds.test.ts`, …)
- [ ] Docs updated if architecture/behavior changed (AGENTS.md, design doc)
