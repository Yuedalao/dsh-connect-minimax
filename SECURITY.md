# Security

This plugin reads the local MiniMax Code credential file at
`%USERPROFILE%\.minimax\auth\prod\cn\mcode-public\auth.json`.

- Access and refresh tokens are never sent to the DSH settings page.
- Tokens are never written to repository files or logs by this plugin.
- The MiniMax gateway request is sent through a random loopback-only port.
- The local shim requires a per-process random bearer secret.
- Credential refresh preserves `loginEpoch`, the refresh token, and unknown
  credential fields.
- An invalid refresh response does not delete or sign out the local MiniMax
  Code account.

Report security issues privately through GitHub Security Advisories rather than
opening a public issue containing credentials or local paths.
