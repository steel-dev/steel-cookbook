# Sign up with an emailed verification code (Pidgeon)

Most sign-up forms end with "we sent you a code". A browser agent can fill in the form, but it needs an inbox it controls to read the code. This recipe gives a Browser Use agent, running in a Steel session, an email address of its own from [Pidgeon](https://pidgeon.ai), an email inbox API for agents. The agent signs up with that address, waits for the verification email, enters the code, and finishes the sign-up.

Two tools carry the email side, defined in `tools_for`:

```python
@tools.action("Create the email address to sign up with. ...", terminates_sequence=True)
async def create_inbox() -> str:
    return f"Your email address is {await inbox.create()}. Type it exactly as written."

@tools.action("Wait up to 30 seconds for the next email with a verification code or link ...", terminates_sequence=True)
async def wait_for_email() -> str:
    ...
    return await inbox.wait()
```

`create_inbox` makes one address on `pidgeon.email` for the run. Asked again, it returns the same address, so a model that loses track does not sign up twice with two inboxes. `terminates_sequence=True` ends the step, so the model reads the address before it types it.

`wait_for_email` calls Pidgeon's await endpoint, which holds the request open until mail arrives:

```python
answer = await messages_await.asyncio(
    client=self.client,
    identity_id=self.id,
    has_code=MessagesAwaitHasCode.TRUE,
    body=MessagesAwaitBody.CLEAN,
    after=self.cursor,
    timeout=WAIT_SECONDS,
)
self.cursor = datetime.fromisoformat(answer.data.cursor)
```

Three things in that call matter:

- `after=self.cursor` starts at the moment the address was created, and moves to the returned `cursor` after each wait. A code that lands before the agent asks for it is still returned, and nothing that arrives between two waits is skipped.
- `has_code=TRUE` skips mail without a code or a verification link, such as a welcome email.
- `message.extracted.codes` and `message.extracted.links` come back already parsed, most likely first. The model types the code; it does not have to find it in the HTML.

If nothing arrives within 30 seconds, the tool says so and the model calls it again. A short wait that answers "nothing yet" is easier for a model to act on than one long call that runs out the step's time.

## Run it

```bash
cd examples/pidgeon-email-verification
cp .env.example .env
uv run main.py
```

Set four variables in `.env`:

- `STEEL_API_KEY` from [app.steel.dev](https://app.steel.dev/settings/api-keys)
- `OPENAI_API_KEY` from [platform.openai.com](https://platform.openai.com/api-keys)
- `PIDGEON_API_KEY` from [pidgeon.ai/app/developers/keys](https://pidgeon.ai/app/developers/keys). It needs Admin access, because it creates the address.
- `SIGNUP_URL`: the sign-up page. Use a site you own, or one whose terms allow automated sign-ups.

Your output varies. Structure looks like this:

```text
View live session at: https://app.steel.dev/sessions/ab12cd34…
 INFO     [Agent] Step 1: create_inbox
 INFO     [Agent] Step 2: navigate to https://example.com/signup
 INFO     [Agent] Step 3: input steel-3f9a1c@pidgeon.email into email field
 INFO     [Agent] Step 4: click Create account
 INFO     [Agent] Step 5: wait_for_email
 INFO     [Agent] Step 6: input 482913 into verification code field
 INFO     [Agent] Step 7: done
Address: steel-3f9a1c@pidgeon.email. Duration: 74.2s
Result: Account created and verified. Signed in as Ada.
Session released. Replay: https://app.steel.dev/sessions/ab12cd34…
```

The `finally` block deletes the address and releases the Steel session. If the script dies before that, the address stops taking mail an hour after it was created (`expires_at`).

## Make it yours

- **Keep the address.** Drop `inbox.delete()` and `expires_at`, and store `inbox.id`. Password resets and later notices then reach the same inbox, so the agent can sign in again on its own.
- **Narrow the wait.** Add `from_="no-reply@example.com"` or `subject_contains="code"` to `messages_await` when the site sends several emails at once.
- **Use your own domain.** Change `pidgeon.email` in `Inbox.create` to a domain you have verified in Pidgeon.
- **Stop at CAPTCHAs, or solve them.** The task tells the agent to stop. Pair this recipe with [browser-use-captcha-auto](../browser-use-captcha-auto) to let Steel solve them instead.

## Related

- [Build a browser agent with Browser Use](../browser-use)
- [Browser Use docs](https://docs.browser-use.com)
- [Pidgeon docs: verification codes](https://pidgeon.ai/docs/verification-codes)
