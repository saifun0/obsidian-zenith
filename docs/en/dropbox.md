# Setting up Dropbox

[← Documentation](../../README.md) · **English** · [Русский](../ru/dropbox.md)

This build of Zenith ships with a Dropbox app registration, so there is nothing to set up
on Dropbox's side: skip to step 8, leave **Dropbox app key** empty, and press Connect.

Registering your own is worth it if you would rather have your own rate limits, your own
name on the consent screen, and no dependence on a registration you do not control. It
takes about two minutes — and note step 5: your own app needs the redirect URI added, or
authorization fails before it starts.

1. Open <https://www.dropbox.com/developers/apps> and choose **Create app**.
2. Pick **Scoped access**.
3. Pick the access type:
   - **App folder** — recommended. Zenith can only ever see `/Apps/<your app name>/`, so a
     mistake cannot reach the rest of your Dropbox.
   - **Full Dropbox** — only if the vault has to live somewhere that already exists.
4. Give it a name. Dropbox app names are globally unique, so `zenith-yourname` rather than
   `zenith`.
5. Under **OAuth 2 → Redirect URIs**, add `obsidian://zenith-dropbox` and press **Add**.
   This is what lets the browser hand the authorization straight back to Obsidian instead
   of making you copy a code — and unlike a `localhost` redirect it works on a phone too.
   Leave **Allow public clients (Implicit Grant & PKCE)** on **Allow**.
6. Go to the **Permissions** tab and tick all four of:

   | Scope | What Zenith does with it |
   | --- | --- |
   | `account_info.read` | Confirm the connection works, for the **Test** button |
   | `files.metadata.read` | List the folder and check a single file |
   | `files.content.read` | Download |
   | `files.content.write` | Upload and delete |

   Then press **Submit** at the bottom. It is easy to miss, and nothing is saved without it.
7. Back on the **Settings** tab, copy the **App key**. Not the App secret — Zenith
   authorizes with PKCE and never sends a secret, which is what lets it run on a phone.

Then in Obsidian, under **Settings → Zenith → Sync**:

8. Turn on **Sync note files** and choose **Dropbox** as the backend.
9. Paste the App key into **Dropbox app key**.
10. Set **Folder in the account** — with App-folder access this is relative to
   `/Apps/<your app name>/`. Leave it empty to use that folder directly. If you are
   turning on encryption, this has to be a folder with nothing in it.
11. Press **Connect**. Dropbox opens in your browser; approve the app and it returns you
    to Obsidian on its own. If it does not — some desktops hand custom links nowhere — use
    **The browser did not bring me back**, which starts the flow again with the code shown
    on screen for you to copy.
12. Press **Test connection**, then **Preview** — and read the plan before applying it. The
    first run always asks, whatever it contains.

## Why a client id can ship at all

An OAuth `client_id` is not a secret. RFC 8252 starts from the position that a native app
cannot keep one, and PKCE exists so a published id is still safe to authorize against: the
code it yields is useless without a verifier that never leaves the device. Every desktop
application talking to these providers has its id in the binary.

What a shared registration costs is shared fate — provider limits apply partly per app, a
registration can be throttled, and a development-status Dropbox app is capped on linked
accounts until it has been through review. That is what the override is for.

## If it does not work

**"This Dropbox app is not allowed to …"** — a permission is missing. Add it in the
Permissions tab, press Submit, then **Disconnect and Connect again** in Zenith: an
authorization already granted does not pick up permissions added afterwards. This is the
single most common way to get stuck.

**"Dropbox rejected the connection — authorize again"** — the stored token is dead.
Disconnect and connect again.

**The browser shows an error about the redirect URI.** `obsidian://zenith-dropbox` is
missing from the app's Redirect URIs, or was typed differently — Dropbox compares it
exactly. Add it, or use **The browser did not bring me back** to authorize by copying the
code instead.

**The app is in "Development" status.** That is fine and needs no application: development
apps work fully, for up to 500 linked accounts. Only publishing to other people needs
production status.

**Sync feels slow, or a lot of files fail.** Lower **Parallel transfers**. Zenith already
waits out Dropbox's rate limiting rather than failing the file, but fewer transfers at
once means it has less to wait out.
