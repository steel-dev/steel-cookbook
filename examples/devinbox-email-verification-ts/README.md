# Email Verification with DevInbox (TypeScript)

A signup form that mails a code or a link ends an unattended run: the browser has nowhere to read mail from, and the agent sits at "check your email" until it times out. This recipe hands the run an inbox of its own. [DevInbox](https://devinbox.io) mints a throwaway address, Playwright types that address into a real registration form on a Steel cloud browser, and one long-poll call blocks until the mail lands and returns the link already parsed out of the body.

The target is [practice.expandtesting.com](https://practice.expandtesting.com/notes/app/register), the same practice site the [auth-context](../auth-context-ts) recipe logs into. Its Notes app really does send mail to whatever address you register, so the loop here is genuine: register, ask for a password reset, read the mail, set a new password from the emailed link, sign in with it.

```typescript
const inbox = await createInbox();              // agent-owned address
await register(page, inbox.address);            // browser fills the form
const since = await requestReset(page, inbox.address);
const link = await waitForResetLink(inbox, since);  // blocks, returns { link }
await setNewPassword(page, link);               // browser finishes the job
await signIn(page, inbox.address);
```

Nothing in the loop is model-driven, so the run costs one Steel session and no tokens. Drop the same three DevInbox calls into a Browser Use, Stagehand, or Claude computer-use agent when you want the reasoning back.

## One call instead of a polling loop

The instinct at step three is a sleep-and-poll loop: list messages, sleep five seconds, list again. `waitForResetLink` replaces the whole thing with `GET /messages/{key}/wait`, which holds the connection open and returns the moment a message arrives, or `204 No Content` when the window closes. The default window is 60 seconds and the cap is 120.

The subtle part is the timestamp. `requestReset` captures `since` before it clicks submit, not after:

```typescript
const since = new Date().toISOString();
await page.click('[data-testid="forgot-password-submit"]');
```

The wait endpoint only returns mail received after `since`, which defaults to the instant the request lands. Expandtesting sends within a few seconds, and on a slow hop the mail can beat your own request to the API. Capturing the timestamp on the browser side of the click closes that gap: the message qualifies whether it arrives before or after the call.

A `204` is a real answer, not a failure to retry blindly. It means the mail never came, so the recovery is the site's resend control plus a fresh `since`, which is why `waitForResetLink` throws with that instruction rather than looping.

## Extraction without a model in the path

`ensureTemplate` registers a pattern once, keyed by name:

```typescript
const TEMPLATE_BODY = "Reset password link: {{link}}";
```

Passing `template=expandtesting-reset` on the wait call changes the response shape: `subject` and `body` come back as dictionaries of the variables you named instead of raw strings, so `message.body.link` is the URL and nothing else. `{{link}}` runs to the end of its line, which keeps a trailing capture from swallowing the rest of the message.

The alternative is to put the raw email in a model's context and ask for the link. That works most of the time, which is the problem: an occasional transposed digit or a URL lifted from the footer is hard to spot in a run nobody is watching, and every retry re-reads the whole HTML body. A pattern either matches or it does not. When it stops matching, `waitForResetLink` says so by name instead of acting on a plausible wrong value.

Creating the template returns `409` if a previous run already made it. The recipe treats that as success, so re-runs are clean.

## Run it

```bash
cd examples/devinbox-email-verification-ts
cp .env.example .env    # set STEEL_API_KEY and DEVINBOX_API_KEY
npm install
npm start
```

Get a Steel key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys) and a DevInbox key at [devinbox.io](https://devinbox.io). The DevInbox key needs three scopes: `inbox:write` to mint the address, `inbox:read` to wait on it, and `config:write` to register the template. Temporary inboxes are not metered and expire an hour later, so each run gets a fresh account and leaves nothing to clean up.

Your output varies. The shape is illustrative, not literal:

```text
Steel + DevInbox email verification
============================================================
Extraction template 'expandtesting-reset' ready
Inbox ready: <32-hex>@devinbox.io

Creating Steel session...
Steel Session created!
View session at https://app.steel.dev/sessions/<id>
Connected to browser via Playwright

Registering an account on the inbox address...
Account created
Requesting a password reset link...
Waiting for the mail (long-poll, up to 90s)...
Link extracted after 4.1s
   https://practice.expandtesting.com/notes/app/reset-password/<64-hex>
Setting a new password from the emailed link...
Password updated
Signing in with the new password...
Signed in. Landed on https://practice.expandtesting.com/notes/app

Releasing session...
Session released
Done!
```

The whole run takes 30 to 60 seconds, most of it browser navigation. The mail itself typically lands about 4 seconds after the form submit.

## Make it yours

- **Point it at your own signup.** Swap the four `data-testid` selectors in `register` and the URL in `APP`. The DevInbox half does not change: any sender, any site.
- **Capture a code instead of a link.** For a six-digit OTP the pattern is `Your verification code is {{code}}` and the value arrives as `message.body.code`. Type it into the verification field rather than navigating. Keep the gap between extraction and submission short, since codes expire.
- **Keep the account.** `createInbox` sends `isTemporary: true`. Send `{ name: "checkout-agent", isTemporary: false }` instead and the agent owns `checkout-agent@devinbox.io` permanently, which is what you want when the receipts, password resets, and security alerts that follow signup also need a home.
- **Read from both halves of the message.** A template can carry a subject pattern as well as a body pattern, so a code in the subject line and a name in the body land in `message.subject` and `message.body` from the same call.
- **Hand it to an agent.** The three fetch calls are ordinary HTTPS, so they drop into a tool-calling loop unchanged. DevInbox also ships an MCP server if you would rather the model call `create_inbox` and `wait_for_email` itself.
- **Run the fleet in parallel.** Every run mints its own address, so N concurrent sessions never read each other's mail. That is the part a shared QA mailbox cannot do.

## Related

[auth-context](../auth-context-ts) reuses the session you just authenticated so the next run skips the login. [credentials](../credentials-ts) stores the password itself. [browser-use](../browser-use) puts a model in the loop that could drive this flow from a plain-English task. [DevInbox API reference](https://devinbox.io/doc/api-guide).
