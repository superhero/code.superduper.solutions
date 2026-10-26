# Assistant presentation

`AIPanel.svelte` presents the **AI** pane with Ollama, OpenAI and installable browser-model connections
from [`$lib/assistant`](../../assistant/README.md). Keep pane, toolbar
and conversation labels independent of the inference provider; provider-specific
connection guidance still names the current adapter. Application composition
opens it from the toolbar's right end and permits AI and Git to remain open side by side. Their open states and saved
widths are independent; the shared dock reserves space for the editor.
Shared `Sheet.Pane` owns the right dock, synchronized main-view motion,
focus restoration, Escape and reduced motion. `WidthDivider` supplies resizing;
Button and NavigationDropdown retain the editor's shared control behavior.
AI uses the same application-owned resize preview, neighbour allocation,
cancellation and persistence callbacks as History, Git, Vault and Resources.

Use semantic palette roles and workbench header/toolbar/tab geometry. Do not
import the reference demo's layout. Tabs are available before connecting; each
`Conversation` owns a selected connection, model, transcript, draft, scroll context and
request lifecycle. New chat creates an independent tab using the current
profile suggested. Browser sessions open directly in the composer; remote
profiles retain their explicit connection step. Reconnection and model selection retain the thread.
Browser sessions keep the model menu and draft editable during generation.
Each submitted prompt captures its model and configuration, appears as a
cancellable queued prompt while waiting, and enters the transcript after the
previous reply finishes. The shared runtime queue loads that model before its
whole Pi turn. Cancelling or closing a waiting chat leaves other chats running.
Sent user messages align right and show the local date and time captured when
sent. Assistant messages have no speaker header. Timestamps belong only to presentation and are
excluded from provider payloads.
Completed and interrupted requests expose two tooltips on their centered result
icon: the result text on the left, and `time to first response / total time` on
the right. Both stay hidden until hover or keyboard focus; there is no assistant header or visible timing footer. A monotonic clock measures the first
nonempty text delta before render batching and elapsed request time at completion
or interruption. Timing is frozen once measured, kept per conversation, and never
enters provider messages. If a request fails before any response, the first value
is a dash rather than an invented duration. Milliseconds appear only below five seconds, seconds
only below one hour. Longer durations use days, hours and minutes as needed.
Only a model's trailing standalone `Generated on YYYY-MM-DD` paragraph after a
horizontal rule is hidden from AI document presentation; user messages, quoted
examples, code and the original provider conversation remain intact.
Connection, conversations and width remain in memory across pane close/open.
Narrow viewports keep AI beside the editor, closing older panes when needed. The model row also exposes
used/context tokens. Clicking that meter slides open a vertical context slider
above it, with 1,024-token steps within the selected model's configured capacity.
Each change saves automatically through normal settings history. Keyboard arrows,
Home and End adjust the slider; Escape or clicking outside closes it. Tool calls
from Pi, including settings and ordinary Git reads, appear as bounded expandable
arguments/results below their user message.
The composer model label uses normal weight without changing menu options.

Render only the selected conversation. Keep completed messages in raw state
arrays and update only the active reply at most once per animation frame.
Hidden conversations buffer without scheduling renders; switching tabs preserves
their requests. Flush on selection/completion/cancellation and reject results
from disposed tabs. Closing a tab aborts its requests; closing the pane aborts
all requests. Follow the bottom only while the reader is near it, retaining
scroll context per tab. `MarkdownMessage.svelte` renders each role with the shared
assistant markdown-it configuration and the complete [mdit catalog](../../../../docs/markdown.md).
The composer keeps editable source; messages share accessible tabs, spoilers,
scoped anchors, read-only task lists and opt-in external previews. Repository
includes/snippets use bounded browser storage reads and never alter provider
payloads. KaTeX and explicit MathJax blocks work offline with embedded assets.
Keep completed top-level blocks and message IDs stable during streaming and
completion; only changed block HTML is replaced. Source HTML is escaped and
rendering never automatically requests external media.
Rendered documents use a six-level heading scale, visible nested list markers,
consistent paragraph spacing inside blocks and extensions, and full-width tables
with aligned headers and alternating rows. Code, quotes, alerts, disclosures and
tab groups use borderless palette surfaces. Inline code keeps its foreground-only
style. Task checkboxes stay read-only and fully opaque; links, tabs and disclosures
retain visible keyboard focus and reduced-motion behavior. Wide code scrolls
inside its block; spacing remains inside the message width at compact sizes.
Assistant replies retain their largest rendered height at the current content
width, including completion and tab switches. Markdown transformations such as a
completed link can leave reserved blank space instead of pulling the transcript
and loader upward. Resizing resets that floor to the content's natural height.
Growth slides open over 150ms without scaling the text; reduced motion and width
reflow update immediately. The loader follows the animated edge, and bottom-follow
continues during the transition unless the reader has scrolled up.
`message-height.ts` shares one lazy ResizeObserver across mounted replies, observes
their natural content and animated size, and batches height targets through one
owned animation frame. It releases targets and cancels pending work on unmount.
Each conversation retains only a width/height pair per reply; these are
transient presentation measurements, separate from the text and application history.

`MarkdownComposer.svelte` owns a small CodeMirror Markdown field. Source markers
remain visible alongside bold, italic, strike, code, heading, link and highlight
formatting. Its ephemeral undo belongs only to the draft; source-editor history,
application shortcuts and wheel zoom stay independent. Keep sent Markdown intact.

Tabs have roving keyboard focus: Left/Right, Home/End and Delete for closure.
`SessionTab.svelte` defaults titles to Session 1, Session 2, and so on. Its
shared context menu offers Rename, including through Shift+F10. Inline title
editing saves with Enter and cancels with Escape or loss of focus; empty names
retain the existing title. Renaming preserves the conversation and its requests.
The overflowing strip scrolls horizontally with the wheel. Closing the last tab
creates an empty replacement. Session tabs align to the top of the shared tab row,
leaving the editor's measured scrollbar space below them when file tabs overflow.
Enter sends by default, Shift+Enter inserts a newline,
and IME composition is preserved. Settings → AI can show the hidden-by-default
Send button or make Enter insert a newline. Ctrl/Cmd+Enter sends in either mode.
The existing personal/repository settings and application history own these choices;
changes apply live without replacing the draft. A fixed-height action row follows
the last message and centers the rotating stop control during generation. Its
accessible name is "Stop generating"; it has no hover tooltip. Generation status stays available to screen readers without
visible status text. The transcript scrolls vertically without a visible scrollbar;
wide code and tables scroll within their Markdown blocks. Message cards and the
composer share the same available width.
Hover or keyboard focus scales the whole indicator and reveals a Stop symbol
above the rotating circle, using the primary background color for its foreground.
SVG circles and a fixed CSS stop square share an explicit center. Only the
outer circle visibly rotates; the stop overlay remains stationary.
Output limits, cancellations and request failures replace the rotating control
with a centered Skull icon. Its left tooltip explains the interruption, including the
provider's failure message when available. Successful completion instead shows
a Verified icon in the same position, with "Generation completed" on the left.
Both result icons reveal the measured timing in a second tooltip on the right.
Both result icons are non-actionable, focusable images with a default cursor,
without button activation or hover fills. Their two tooltips use plain foreground
text in kbd tags at 90% of the standard tooltip size, normal weight and 60% opacity,
on the main background, without borders, shadows or pointers; spacing and hover/focus behavior stay the same.
Status and errors remain announced to screen readers. Starting a new turn clears
the previous result indicator; an enabled
Send button stays on the right without moving the indicator.

The AI toolbar’s optional connection shortcut opens Settings → AI while retaining
conversation tabs and drafts. It defaults off; Settings → Controls → AI toolbar
can enable Connection settings. `ConnectionsView.svelte` lives in Settings → AI,
including saved profiles, browser
model installation/configuration, speech setup and the connection form. Speech
settings are available in Settings → AI. All speech
variants appear in the model menu beside Dictate, including uninstalled ones.
Selecting a model installs missing files and queues its load. The separate
Dictate button starts or stops recording and cancels preparation; the arrow
opens model selection. Closing or switching the conversation cancels a pending
speech startup before it can request the microphone. Vault management is a separate [sliding pane](../vault/README.md), opened
from the editor toolbar or first header's Page menu. AI has no vault buttons.
The Add Link button opens a blank New connection dialog. Each editable profile's
Edit button opens the same dialog with its saved values. Save applies changes;
Cancel, Escape and Close dismiss drafts and return focus to the action button.
WebML, Wllama and LiteRT-LM are separate built-in entries, with WebML selected initially.
The browser composer lists the complete eight-model language catalog, including unloaded
and uninstalled models. Menu entries show installation state and download size.
Selecting a model installs missing files and loads it through its pinned engine;
opening chat only reads local metadata. Loading can be cancelled without losing
the draft. Re-selecting the current menu entry also prepares that model.
Ollama and OpenAI profiles are added explicitly and can be renamed or removed.
Runtime URLs appear only in connection settings, never in the chat selector.
Vision and Decision models have separate Settings sections; they are excluded from the LLM selector. Gemma/MiniCPM image requests use the transient LFM image tool while retaining the same conversation.
Inference engine profiles contain
only public configuration and an opaque vault entry ID. An Ollama profile
needs no key. OpenAI resolves its selected key inside the secret worker; no
decrypted API key belongs to conversation state or a connection form. Editing or
removing a profile disconnects affected conversations without discarding their
messages. Application composition refreshes the public key metadata when the
global Vault pane changes guarded entries; secret values never enter AI UI state.

`SkillsSettings.svelte` owns skill drafts and the create/import/edit/toggle/remove
controls. SettingsPage supplies personal or repository override values; it does
not write repository files or dispatch model requests while editing. Imported
SKILL.md files open a draft before Save. Pi advertises enabled metadata and loads
body text through the visible `load_skill` tool, as described in the assistant
service guide.

Git and AI have independent persisted visibility in `workspace.rightPanes`.
Legacy single `rightPane` snapshots still restore. Panes share the work area
in columns while preserving the editor; saved width preferences remain intact
when the viewport temporarily constrains them. `workspace.paneOrder` records
opening order, including the optional file explorer. Older panes close when
their minimum widths no longer fit. The newly opened pane takes priority.
Closed panes remain closed on expansion, and the toolbar's File explorer button
can restore the tree. At widths below 640px the editor and remaining side pane
share the available width; AI stays docked instead of covering the editor.

`BrowserModels.svelte` reuses the shared secondary Button and NavigationDropdown
controls inside Connections. Installation, runtime and generation controls remain
independent of chat transcripts. Browser conversations place Attach image beneath
the message draft; model management stays in Settings → AI. Model-specific image limitations and compatibility
checks are visible before installing/loading. Downloads group their Cancel control,
palette progress bar, byte count and percentage in one status area. Compatibility
rows keep passed checks compact; failed checks, limitations and unmeasurable values
show their explanations, with all other details available by keyboard or pointer.
The [browser model guide](../../assistant/browser/README.md)
owns the catalog, storage, source pins and verification scope.

`ModelOperation.svelte` shares status icons, spacing, transfer counters and
`ModelProgress.svelte` between language and speech model cards. Dictation
preparation uses the same measured/indeterminate bar below its toolbar, with
reduced-motion handling. Compact cards keep size/actions in their own wrapping
row so added Load/Remove controls do not squeeze model names. Settings summaries
span the available width and paired fields keep their inputs aligned when labels
wrap. Fixed vision/decision profiles expose their verified summary without LLM
execution controls; Strands rows name their CPU or WebGPU backend explicitly.
