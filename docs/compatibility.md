# Compatibility inventory — not a compatibility certification

Read-only inventory of the owner's configured setup, 2026-09-07. No extensions were loaded/unloaded for this inventory, no settings changed, no credentials or provider/MCP configuration collected, and no coexistence tests run. Package metadata and selected source registration sites were inspected statically. Configured presence is not proof of successful loading or behavior.

## Observed package set

23 configured package entries; pi-drawio has extensions/skills/prompts/themes disabled. No project-level package/extension settings found in this repository. Three local TypeScript extension files concern UI/status/prefill; another local directory contains state, not an identified loadable extension. Local source and personal configuration are not copied here.

| Package | Installed version | Initial test priority / reason |
|---|---|---|
| pi-subagents | 0.66.0 | High: overlapping delegation choices; parent/session/compaction hooks |
| @tranhoangnguyen0310/pi-flow-external | 1.7.0-external.1 | High: overlapping delegation, prompt injection and active-tool changes |
| @sherif-fanous/pi-rtk | 0.6.0 | High: registers a Bash wrapper with command rewriting |
| pi-mcp-adapter | 2.32.1 | High: custom tools and active-tool selection; child capability gap |
| @firstpick/pi-extension-tools | 0.2.3 | High: active-tool selection on lifecycle/model events |
| pi-tool-repair | 0.2.5 | High: request/message hooks, tool schema/availability handling |
| pi-openai-server-compaction (Git) | 0.1.0 | High: dynamic provider registration and compaction/request hooks |
| pi-prompt-template-model | 0.12.2 | High: model/prompt/session hooks and generated tools |
| pi-personas | 0.2.0 | High: prompt/persona/delegation integration and old declared peer range |
| pi-cc-extensions | 0.8.69 | Medium/high: session/request-adjacent features, tool renderers and older peer ranges |
| pi-btw | 0.4.1 | Medium: separate conversations and context/session hooks |
| pi-adaptive-dev | 0.3.0 | Medium: workflow instructions and plan tracker; bundled resources need separate inspection |
| @dietrichgebert/ponytail (Git) | 4.9.0 | Medium: parent guidance; fresh/fork inheritance expectations |
| pi-intercom | 0.13.0 | Medium: parent communication capability absent in scope children |
| pi-docparser | 4.0.0 | Medium: parent custom tools absent in scope children |
| pi-agent-browser | 0.1.0 | Medium: parent browser tools absent in children; legacy peer package names |
| pi-simple-web | 0.1.0 | Medium: parent web tools absent in children; legacy peer package names |
| @dreki-gg/pi-slack | 0.5.1 | Medium: parent custom tools absent in children |
| pi-markdown-preview | 0.16.0 | Lower initial priority: rendering; coexistence untested |
| pi-powerline-footer | 0.17.0 | Lower initial priority: UI/accounting; nested usage display untested |
| pi-atelier | 0.10.1 | Unclassified beyond entry metadata; inspect before testing |
| pi-bro | 0.10.0 | Unclassified beyond entry metadata; inspect before testing |
| pi-drawio | 0.1.0 | Disabled resources; not an active test target unless owner enables it |

Priorities select investigation, not known failures. Presence of the same hook in two packages does not itself establish a conflict. Static scanning covered selected sources, not all transitive/bundled registrations or runtime branches.

## Concrete compatibility boundaries to test

1. **Parent versus child:** pi-scopes child runtimes do not inherit other extension runtimes. Browser/MCP/Slack/parser tools and RTK's parent Bash wrapper are not automatically supplied to the child. Fork may carry textual instructions mentioning unavailable tools. This is a capability boundary, not evidence that the parent extensions break.
2. **Dynamic providers:** server-compaction source registers a provider. Determine actual selected-provider behavior before attempting a scope; dynamic providers are not automatically copied into the hermetic child model runtime. Inventory did not inspect owner model selections or credentials.
3. **Active-tool selection:** MCP/tool-selection/profile extensions call setActiveTools. Test whether scope stays available as intended across startup and model/session changes; do not assert it is currently removed.
4. **Delegation judgment:** pi-subagents, external flow and pi-scopes may all be visible. This is not necessarily a name collision. Test whether the main agent chooses the intended mechanism without conflicting instructions or child recursion.
5. **Permissions:** no claim of inherited parent enforcement. Current host child work is unrestricted. A policy test fixture is needed even if this inventory does not identify a particular policy extension.

## Declared version warnings, not diagnosed runtime failures

The planned release pins Pi 0.85.1. Installed metadata declares:

- pi-personas: coding-agent >=0.80.6 <0.81.0.
- pi-openai-server-compaction: coding-agent/AI/agent-core >=0.80.9 <0.81.0.
- pi-mcp-adapter: AI ^0.84.1 (does not cover 0.85.1).
- pi-cc-extensions: coding-agent/AI/TUI ^0.84.0 (does not cover 0.85.1).
- pi-agent-browser and pi-simple-web: legacy @mariozechner peer names.

These are package-declared mismatches worth checking, not proof that pi-scopes causes incompatibility, nor grounds to disable anything automatically. Actual APIs/runtime behavior and Pi's alias handling require targeted validation. The current running Pi version was not established by reading these manifests.

## Next validation

Use isolated test settings and safe scripted provider/collision fixtures first. Verify supported Pi introspection APIs before implementing diagnostics. Then test high-priority combinations with the owner's approval and no personal settings changes. Report each as observed compatible for a stated scenario/version, observed failure with reproduction, or untested. Do not load all packages blindly: startup hooks may start services or contact external systems.

Initial release platforms: macOS, Linux, Windows through WSL2. Native Windows is not required. CPU architecture, target Pi version and Docker availability still need concrete acceptance environments. This inventory does not validate any platform.
