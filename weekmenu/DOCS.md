# Weekmenu

Plan your meals from Sunday to Saturday, tick off what you already have at home,
and get one shopping list for Albert Heijn or Jumbo.

- **Recipe collection** with photos. Add recipes by hand, or import them.
- **One-tap import.** Open a recipe on any website (Jumbo, Allerhande or a food blog),
  tap **Share** on your Android phone or tablet and choose **Weekmenu**. The name,
  photo, servings, ingredients and steps are read from the page.
  On a computer, drag the **Add to Weekmenu** button from Settings to your bookmarks bar.
- **Week plan.** Tap a recipe, pick a day, tick the ingredients you already have.
- **Shopping list.** All days are merged into one list, with amounts added up.
- Sending the list to the Albert Heijn or Jumbo cart is the next step (not built yet).

## Setting up

1. Start the add-on and turn on **Show in sidebar**.
2. Click **Weekmenu** in the Home Assistant menu. It opens right there, also in the
   Home Assistant app on your phone or tablet, and you don't need a separate password.

Your recipes, week plan and photos are stored in the add-on's own data folder and are
included in Home Assistant backups.

## Its own address (for the Share button)

The sidebar is all you need for planning. To import recipes with the **Share** button on
Android, or with a bookmark on a computer, Weekmenu also needs its own address:

1. On the add-on's **Configuration** tab, enter a **password**. You sign in to that address with it.
2. Restart the add-on. Weekmenu is then also on port **8099**.

Without a password that port stays closed and Weekmenu only opens from the sidebar.

## Using it on your phone (https)

At home on your Wi-Fi you can open `http://<your Home Assistant address>:8099` in any browser.
To install Weekmenu on Android and get it in the **Share** menu, Chrome requires a secure
**https** address. If you use the **Duck DNS** add-on (or **Let's Encrypt**), Weekmenu can use the
same certificate:

1. On the Configuration tab, turn on **ssl**. Leave `certfile` and `keyfile` as
   `fullchain.pem` and `privkey.pem` unless your certificate add-on uses other names.
2. Restart the add-on.
3. On your router, forward port **8099** to your Home Assistant machine, if you want to use
   Weekmenu away from home.
4. On your phone, open `https://<your-name>.duckdns.org:8099` in Chrome, sign in, then tap the
   menu (⋮) and choose **Install app** or **Add to Home screen**.

### With Tailscale instead of port forwarding

The community add-on **Tailscale with features** can copy its `ts.net` certificate into `/ssl`:

1. In that add-on, turn on `share_homeassistant`, and set `lets_encrypt_certfile` to
   `ts-fullchain.pem` and `lets_encrypt_keyfile` to `ts-privkey.pem`. Restart it.
2. In Weekmenu, turn on **ssl** and set `certfile` and `keyfile` to those same names. Restart.
3. With Tailscale switched on on your phone, open `https://<device>.<tailnet>.ts.net:8099` in Chrome
   and install the app from there.

## Options

| Option | Meaning |
|---|---|
| `password` | Password for Weekmenu's own address on port 8099. Leave empty to use only the sidebar. |
| `ssl` | Serve Weekmenu over https using the certificate in `/ssl`. |
| `certfile` | Certificate file in `/ssl`. Default `fullchain.pem`. |
| `keyfile` | Private key file in `/ssl`. Default `privkey.pem`. |

## Running without Home Assistant

You need Node.js 20 or newer. There are no packages to install.

```sh
cd weekmenu
APP_PASSWORD=choose-a-password npm start
```

Settings come from the environment: `APP_PASSWORD`, `PORT` (default 3000), `DATA_DIR`
(default `./data`), and `SSL_CERT` plus `SSL_KEY` for https.

## Development

```sh
cd weekmenu
npm test                      # runs the tests (no network needed)
python3 scripts/make-icons.py # redraws the app icons
```
