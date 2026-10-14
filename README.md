# Weekmenu IJmuiden

Plan your meals from Sunday to Saturday, tick off what you already have at home,
and get one shopping list for Albert Heijn or Jumbo.

## What it does

- **Recipe collection** with photos. Add recipes by hand, or import them.
- **One-tap import.** Open a recipe on any website (Jumbo, Allerhande or a food blog),
  tap **Share** on your Android phone or tablet and choose **Weekmenu**. The name,
  photo, servings, ingredients and steps are read from the page.
  On a computer, drag the **Add to Weekmenu** button from Settings to your bookmarks bar.
- **Week plan.** Tap a recipe, pick a day, tick the ingredients you already have.
- **Shopping list.** All days are merged into one list, with amounts added up.
- Sending the list to the Albert Heijn or Jumbo cart is the next step (not built yet).

Import works on any site that publishes a schema.org `Recipe` block, which nearly every
recipe site does for Google. If a page has none, the recipe is saved with its title and
photo, and the app asks you to add the ingredients.

## Running it

You need Node.js 20 or newer. There are no packages to install.

```sh
APP_PASSWORD=choose-a-password npm start
```

Then open http://localhost:3000. Everything is stored in `./data` (set `DATA_DIR` to change that).

### With Docker

```sh
docker build -t weekmenu .
docker run -d --name weekmenu -p 3000:3000 -e APP_PASSWORD=choose-a-password -v weekmenu-data:/data weekmenu
```

### Installing on Android

The share button only works when the app is served over **https**. Once it is online:

1. Open the address in Chrome.
2. Sign in, then tap the menu (⋮) and choose **Install app** or **Add to Home screen**.
3. Weekmenu now appears in the Share menu.

## Settings

| Variable | Meaning |
|---|---|
| `APP_PASSWORD` | Password to sign in. Required. |
| `PORT` | Port to listen on. Default `3000`. |
| `DATA_DIR` | Folder for recipes, the week plan and photos. Default `./data`. |
| `NODE_ENV=production` | Marks the sign-in cookie as https-only. |

## Development

```sh
npm test                      # runs the tests (no network needed)
python3 scripts/make-icons.py # redraws the app icons
```
