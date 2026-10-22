# Shared application logic

`$lib` resolves here. Keep reusable behavior and browser services in focused
modules; shared presentation lives in [components](components/README.md).

Modules provide repository persistence, editor preferences, Pail logging, and UI
class/prop utilities. The logger
preserves native errors and forwards application failures to the development
overlay while keeping transport failures out of recursive reporting.

[Resources](resources/README.md) owns read-only browser measurements for the
visible Resources page, with bounded in-memory samples and no background recorder.

`startup.ts` coordinates the static loading screen in `index.html`. Keep it in
place until storage, the saved page, fonts, and visible editor measurements are
ready; failures must release it to expose recovery controls. `startup.css`
uses a fixed six-column grid, advancing one square every 200ms in reading order,
with a short stepped trail. Reduced motion keeps the grid still. The optional
`code.appearance.v1` localStorage cache supplies the first paint only; loaded
editor settings replace it. The loader never adds an artificial minimum wait.

The [repository service](repository/README.md) owns IndexedDB, filesystem, Git,
worker, and repository lifecycle behavior. `editor/` owns preferences,
EditorConfig indentation resolution and CodeMirror configuration. Follow the
[local-resource decision](../../docs/adr/local-resource-management.md): one
source Git directory per repository, working content separate from metadata, full clone
history, coordinated writes, and explicit recovery. Do not import Operations'
workflow/catalog models into the editor.

The [formatting service](formatting/README.md) owns the local dprint/Prettier
worker, pinned optional package catalog/installation, formatter selection and
data-only repository configuration. It returns
text; the editor owns applying that result and recording its history.

Add meaningful Cucumber source scenarios for new logic and retain it in the
explicit coverage scope where executable in Node. Browser adapters require
integration scenarios as described in the [test guide](../../tests/README.md).

[intelligence/](intelligence/README.md) owns opt-in language engines, verified
packages and the CodeMirror worker integration.

[assistant/](assistant/README.md) owns saved Ollama/OpenAI connections and chat
transport, separate from language services and repository operations.
[secrets/](secrets/README.md) owns the Operations-derived encrypted vault,
guarded credential use, independent unlock methods and locking lifecycle.
