# Voice AI Assistant

Voice-driven website assistant. Answers questions from page content, navigates pages,
adds products to the cart, checks out, and fills contact forms.

## What was broken in the old version

| # | Problem | Effect |
|---|---------|--------|
| 1 | Model ID `gemini-1.5-flash` | Google shut down all Gemini 1.5 and 2.0 models. Every call returned 404, which the code showed as "API Connection issue". |
| 2 | `app.listen()` with no `module.exports` | Vercel serverless imports a handler from the entry file. With only `listen()`, requests hang or 500. |
| 3 | No `GET /` route | Opening the deployment URL in a browser returned 404, so it looked dead even when `/api/chat` worked. |
| 4 | No frontend | There was no microphone, no speech output, and no code to perform actions. Backend alone does nothing. |

## Deploy

1. Push these files to GitHub (replace the old ones).
2. In Vercel: **Settings -> Environment Variables**, add `GEMINI_API_KEY`.
   Get a key at https://aistudio.google.com/apikey
3. **Deployments -> Redeploy** (env vars only apply to new builds).
4. Open `https://YOUR-APP.vercel.app/api/health`. You want `apiKeyConfigured: true`.
5. Open `https://YOUR-APP.vercel.app/` for the test bench.

## Add to your real website

Paste before `</body>` on every page:

```html
<script src="https://YOUR-APP.vercel.app/voice-agent.js"
        data-api="https://YOUR-APP.vercel.app/api/chat"
        data-lang="en-US"></script>
```

For Urdu speech input use `data-lang="ur-PK"`.

## Custom cart or form logic

The widget clicks real buttons by default. To wire it into your own store code,
define hooks **before** the script tag. Return `true` to take over the action.

```html
<script>
window.VoiceAgentHooks = {
  addToCart: function (product, quantity) {
    myStore.add(product, quantity);
    return true;
  },
  checkout: function () { location.href = '/cart/checkout'; return true; },
  fillField: function (field, value) { return false; }, // false = use default
  submitForm: function () { return false; }
};
</script>
```

## Actions the assistant can trigger

| Action | Triggered by | What the widget does |
|--------|--------------|----------------------|
| `navigate_to_page` | "Take me to About Us" | Sets `location.href` to a path from the page's own link list |
| `add_to_cart` | "Add two blue mugs" | Sets the quantity input, clicks the matching Add to cart button |
| `proceed_to_checkout` | "Check out" | Clicks a checkout link, or falls back to `/checkout` |
| `fill_form_field` | "My email is ali@x.com" | Finds the input by name, id, label, placeholder, or type; fires React-safe input events |
| `submit_contact_form` | "Send it" | Clicks the form's submit button |

## Browser support

Speech input uses the Web Speech API: Chrome, Edge, and Safari. On Firefox the widget
falls back to a text prompt. HTTPS is required for microphone access, which Vercel provides.

## Local development

```bash
npm install
GEMINI_API_KEY=your_key npm start
# open http://localhost:3000
```
