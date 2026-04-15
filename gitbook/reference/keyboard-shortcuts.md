# Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Alt+G` | Toggle dashboard overlay |
| `Ctrl+Alt+V` | Toggle voice transcription |
| `Ctrl+Alt+B` | Show background shell processes |
| `Ctrl+V` / `Alt+V` | Paste image from clipboard (screenshot → vision input) |
| `Escape` | Pause auto mode (preserves conversation) |

## Terminal Compatibility

In terminals without Kitty keyboard protocol support (macOS Terminal.app, JetBrains IDEs), slash-command fallbacks are shown instead of `Ctrl+Alt` shortcuts.

{% hint style="tip" %}
If `Ctrl+V` is intercepted by your terminal (e.g. Warp), use `Alt+V` instead for clipboard image paste.
{% endhint %}

## iTerm2 Note

If `Ctrl+Alt` shortcuts trigger the wrong action (e.g., `Ctrl+Alt+G` opens external editor instead of the dashboard), go to **Profiles → Keys → General** and set **Left Option Key** to **Esc+**. This makes Alt/Option work correctly with Ctrl combinations.

## cmux Integration

If you use cmux (terminal multiplexer), SF can integrate with it:

| Command | Description |
|---------|-------------|
| `/sf cmux status` | Show cmux detection and capabilities |
| `/sf cmux on` / `off` | Enable/disable integration |
| `/sf cmux notifications on/off` | Toggle desktop notifications |
| `/sf cmux sidebar on/off` | Toggle sidebar metadata |
| `/sf cmux splits on/off` | Toggle visual subagent splits |
