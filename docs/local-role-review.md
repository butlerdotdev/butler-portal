# Local role review

Butler behaves differently for five kinds of user. This harness puts all
five on screen at once, against one running portal and one set of data, so
a change can be reviewed through every authorization perspective without
logging in and out.

## Start it

```bash
yarn dev:roles:server   # portal with the role config layered
yarn dev:roles          # five windows, one per identity
```

The first command is the normal dev server plus `app-config.roles.yaml`.
The second opens a browser profile per identity and prints where each one
is. Give it a route to start them all somewhere specific:

```bash
yarn dev:roles /butler/admin/clusters
```

## Drive all five at once

The launcher stays attached. Type a route and press enter to send every
window there:

```
roles> /butler/t/platform-engineering/clusters
roles> /butler/admin/teams
roles> shot        # screenshot all five
roles> q
```

## Identities

| Key               | Acts as                              | Scope                                       |
| ----------------- | ------------------------------------ | ------------------------------------------- |
| `platform-admin`  | `e2e-parity-padmin@butlerlabs.dev`   | `platformRole: admin`, no team memberships  |
| `platform-viewer` | `e2e-parity-pviewer@butlerlabs.dev`  | `platformRole: viewer`, no team memberships |
| `team-admin`      | `e2e-parity-tadmin@butlerlabs.dev`   | admin of `platform-engineering`             |
| `team-operator`   | `e2e-parity-operator@butlerlabs.dev` | operator of `platform-engineering`          |
| `team-viewer`     | `e2e-parity-viewer@butlerlabs.dev`   | viewer of `platform-engineering`            |

The three team roles share one team on purpose, so the differences between
them are the only thing that changes between those windows.

The mapping lives in `app-config.roles.yaml`. Point it at your own
butler-server users if you are not running against butler-beta.

## What it does and does not do

Selecting an identity replaces the Backstage sign-in step and nothing
else. The chosen email travels the same path a real session's email
travels: the portal backend mints a proof for that user and butler-server
answers for that user's real roles. A viewer who reaches a mutation gets
the same refusal a real viewer gets.

So the harness cannot grant a capability the user does not have, and the
authorization you see is the authorization that ships.

## Screenshots and the capability matrix

```bash
yarn roles:shots        # every role, every reviewed route, light and dark
node scripts/role-audit.mjs   # what each role can reach and act on
```

Both write under `screenshots/`, which is ignored by git. The audit prints
a table and writes `screenshots/role-audit.json`.

## Safety

`DevIdentities` returns null when `NODE_ENV` is `production`, and logs an
error if config asks for it there. It also stays inert unless
`butler.devAuth.enabled` is set, and it will only ever act as an email
from the configured list, so a stale or invented cookie falls through to
the real session rather than escalating.

The frontend half compiles out of production bundles: the header is only
attached when `process.env.NODE_ENV !== 'production'`.

Do not enable `butler.devAuth` anywhere but a local machine.
