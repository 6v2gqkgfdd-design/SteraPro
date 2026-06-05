# SteraPro — Supabase e-mailtemplates

Gebrande e-mails voor het klantenportaal. Plak elke `.html` in Supabase →
**Authentication → Emails** bij de juiste template, en zet het bijhorende
onderwerp.

| Supabase-template      | Bestand                 | Onderwerp |
|------------------------|-------------------------|-----------|
| Confirm sign up        | `confirm-signup.html`   | Bevestig je SteraPro-account |
| Invite user            | `invite.html`           | Je uitnodiging voor het SteraPro-portaal |
| Magic link or OTP      | `magic-link.html`       | Je inloglink voor SteraPro |
| Change email address   | `change-email.html`     | Bevestig je nieuwe e-mailadres |
| Reset password         | `reset-password.html`   | Stel je SteraPro-wachtwoord opnieuw in |
| Reauthentication       | `reauthentication.html` | Je SteraPro-bevestigingscode |

## Belangrijk

1. **Site URL** moet kloppen, anders wijzen de links naar localhost:
   Authentication → URL Configuration → Site URL = `https://sterapro.vercel.app`,
   en bij Redirect URLs: `https://sterapro.vercel.app/**`.

2. **Afzender ("Supabase Auth")** wijzig je via **custom SMTP**
   (Authentication → Emails → Set up SMTP). Pas dan komt de mail van
   bv. `noreply@sterapro.be` met afzendernaam "SteraPro". De ingebouwde mailer
   heeft ook rate-limits en is niet bedoeld voor productie.

3. De variabelen (`{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}`,
   `{{ .NewEmail }}`) zijn ingevuld zoals Supabase ze per template verwacht —
   niet hernoemen.

4. Het logo komt van `https://sterapro.vercel.app/stera-logo.png`. Werkt pas
   nadat de app gedeployd is op dat domein.
