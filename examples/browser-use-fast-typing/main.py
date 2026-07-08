"""
Fast text insertion tools for Browser Use agents running on Steel browsers.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/browser-use-fast-typing
"""

import asyncio
import os
import sys
from urllib.parse import quote

from browser_use import ActionResult, Agent, BrowserSession, Tools
from browser_use.llm import ChatOpenAI
from dotenv import load_dotenv
from steel import Steel

load_dotenv()

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or "your-openai-api-key-here"

if STEEL_API_KEY == "your-steel-api-key-here":
    print("Set STEEL_API_KEY in environment to continue.")
    sys.exit(1)
if OPENAI_API_KEY == "your-openai-api-key-here":
    print("Set OPENAI_API_KEY in environment to continue.")
    sys.exit(1)

llm = ChatOpenAI(model="gpt-5-mini", api_key=OPENAI_API_KEY)
tools = Tools()
registry = tools.registry

FAST_TYPE_TEXT_JS = """
({ selector, text, clearExisting }) => {
  function describe(element) {
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : "";
    const name = element.getAttribute("name")
      ? `[name="${element.getAttribute("name")}"]`
      : "";
    return `${tag}${id}${name}`;
  }

  function dispatchTextEvents(element, insertedText, inputType) {
    try {
      element.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType, data: insertedText }),
      );
    } catch (_) {
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter ? setter.call(element, value) : (element.value = value);
  }

  const element = document.querySelector(selector);
  if (!element) {
    return { ok: false, error: `No element matched selector: ${selector}` };
  }

  element.focus();
  const inputType = clearExisting ? "insertReplacementText" : "insertText";

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const nextValue = clearExisting ? text : `${element.value}${text}`;
    setNativeValue(element, nextValue);
    dispatchTextEvents(element, text, inputType);
    return { ok: true, target: describe(element), valueLength: nextValue.length };
  }

  if (element instanceof HTMLElement && element.isContentEditable) {
    if (clearExisting) {
      element.textContent = "";
    }
    element.append(document.createTextNode(text));
    dispatchTextEvents(element, text, inputType);
    return { ok: true, target: describe(element), valueLength: element.textContent.length };
  }

  return {
    ok: false,
    error: `Element is not text-editable: ${describe(element)}`,
    target: describe(element),
  };
}
"""


@registry.action(
    description=(
        "Preferred fast-fill tool. Fill an input, textarea, or contenteditable "
        "element by CSS selector using Playwright locator.fill. Use this for "
        "long known values over remote CDP instead of normal typing."
    ),
    domains=["*"],
)
async def fast_type_text_with_locator(
    browser_session: BrowserSession,
    text: str,
    selector: str,
    press_enter: bool = False,
) -> ActionResult:
    try:
        page = await browser_session.must_get_current_page()
        locator = page.locator(selector)

        await locator.fill(text)

        if press_enter:
            await locator.press("Enter")
        else:
            await locator.blur()

        return ActionResult(
            extracted_content=(
                f"Fast filled {len(text)} characters into {selector} with locator.fill."
            ),
            success=True,
        )
    except Exception as e:
        return ActionResult(
            extracted_content=f"Fast typing failed for {selector}: {e}",
            success=False,
            error=str(e),
        )


@registry.action(
    description=(
        "Fallback fast-fill tool. Set text by CSS selector with page.evaluate, "
        "native value setters, and explicit input/change events. Use this if "
        "locator.fill does not update the app's controlled field state."
    ),
    domains=["*"],
)
async def fast_type_text_with_events(
    browser_session: BrowserSession,
    text: str,
    selector: str,
    clear_existing: bool = True,
    press_enter: bool = False,
) -> ActionResult:
    page = await browser_session.must_get_current_page()
    result = await page.evaluate(
        FAST_TYPE_TEXT_JS,
        {
            "selector": selector,
            "text": text,
            "clearExisting": clear_existing,
        },
    )

    if not result.get("ok"):
        return ActionResult(
            extracted_content=f"Fast typing failed for {selector}: {result.get('error')}",
            success=False,
            error=result.get("error"),
        )

    if press_enter:
        await page.keyboard.press("Enter")

    mode = "replaced" if clear_existing else "appended"
    return ActionResult(
        extracted_content=(
            f"Fast typed {len(text)} characters into {result.get('target')} "
            f"with explicit events ({mode}, final length {result.get('valueLength')})."
        ),
        success=True,
    )


class SteelSessionManager:
    def __init__(self, steel_api_key: str):
        self.client = Steel(steel_api_key=steel_api_key)
        self.steel_api_key = steel_api_key
        self.session = None
        self.browser_session = None

    async def __aenter__(self):
        self.session = self.client.sessions.create()
        print(f"Steel session created: {self.session.session_viewer_url}")

        cdp_url = f"{self.session.websocket_url}&apiKey={self.steel_api_key}"
        self.browser_session = BrowserSession(cdp_url=cdp_url)
        await self.browser_session.start()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.browser_session:
            await self.browser_session.kill()
        if self.session:
            self.client.sessions.release(self.session.id)
            print(f"Session released. Replay: {self.session.session_viewer_url}")


async def run_fast_typing_validation(browser_session: BrowserSession) -> None:
    long_text = (
        "This is a deliberately long value used to validate fast_type_text over "
        "a remote CDP connection. It should be inserted with a fast-fill tool "
        "instead of browser-use typing it character by character."
    )
    test_page = """
<!doctype html>
<html>
  <body>
    <label for="notes">Notes</label>
    <textarea id="notes" name="notes" rows="8" cols="80"></textarea>
    <pre id="status">waiting</pre>
    <script>
      const notes = document.querySelector('#notes');
      const status = document.querySelector('#status');
      notes.addEventListener('input', () => {
        status.textContent = `input:${notes.value.length}`;
      });
      notes.addEventListener('change', () => {
        status.textContent += ` change:${notes.value.length}`;
      });
    </script>
  </body>
</html>
"""

    task = f"""
Open this test page and fill the Notes textarea with the provided value.

Test page:
data:text/html,{quote(test_page)}

Value:
{long_text}

Typing rule:
- For any field value longer than 20 characters, click/focus the field first,
  then call fast_type_text_with_locator with selector="#notes" and the complete value.
- If locator.fill does not update the app state, retry that field with
  fast_type_text_with_events.
- Do not use normal character-by-character typing for long text unless
  both fast-fill tools fail.
- If the site shows autocomplete or depends on per-key input behavior, fall back
  to normal typing for that field only.

After filling, report the textarea length and the status text.
"""

    agent = Agent(
        task=task,
        llm=llm,
        tools=tools,
        browser_session=browser_session,
    )
    history = await agent.run(max_steps=10)
    print(f"Final result: {history.final_result()}")


async def main():
    async with SteelSessionManager(STEEL_API_KEY) as manager:
        await run_fast_typing_validation(manager.browser_session)


if __name__ == "__main__":
    asyncio.run(main())
