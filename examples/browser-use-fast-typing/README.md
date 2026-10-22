# Browser Use Fast Typing (Python)

Browser Use normally types through browser actions, which is useful when a field needs per-key behavior but slow for long known values over remote CDP. This recipe gives the agent two explicit fast-fill tools: a preferred Playwright `locator.fill` path and a fallback `page.evaluate` path that sets native values and dispatches `input` and `change` events.

```python
tools = Tools()
registry = tools.registry

@registry.action(description="Preferred fast-fill tool. ...", domains=["*"])
async def fast_type_text_with_locator(...):
    await page.locator(selector).fill(text)

@registry.action(description="Fallback fast-fill tool. ...", domains=["*"])
async def fast_type_text_with_events(...):
    await page.evaluate(FAST_TYPE_TEXT_JS, {...})
```

The validation task opens a local `data:` page with one textarea and a status element that records `input` and `change` events. The prompt tells the agent to use `fast_type_text_with_locator` for values longer than 20 characters, retry with `fast_type_text_with_events` if app state does not update, and reserve normal typing for fields that actually depend on per-key behavior.

## Run it

```bash
cd examples/browser-use-fast-typing
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
uv run main.py
```

Keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [platform.openai.com](https://platform.openai.com/api-keys). A Steel session viewer URL prints at startup so you can watch the agent open the validation page and fill the textarea.

Expected output varies, but the final result should report the textarea length and a status string similar to `input:196 change:196`. The exact length changes if you edit `long_text` in `run_fast_typing_validation`.

The session manager releases the Steel browser in `__aexit__`. Keep that release path when copying these tools into a longer-running agent so failed runs do not leave browser sessions open until timeout.

## Make it yours

- **Copy both tools.** Use `fast_type_text_with_locator` first for normal inputs and textareas. Keep `fast_type_text_with_events` for controlled fields that need explicit DOM events.
- **Be selector-specific.** The tools operate by CSS selector. Have the agent identify or infer stable selectors before calling them, especially on pages with repeated inputs.
- **Keep normal typing available.** Autocomplete, masked inputs, keydown shortcuts, and mention pickers may depend on keyboard events. For those fields, let Browser Use type normally.

## Related

- [Browser Use base](../browser-use): the minimal Steel and Browser Use wiring.
- [Browser Use docs](https://docs.browser-use.com)
