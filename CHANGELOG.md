# Changelog

## 0.2.1

- Read the existing MiniMax Code sign-in instead of asking for an API key.
- Forward Anthropic Messages requests through a loopback-only reverse proxy.
- Refresh credentials only when near expiry or rejected with HTTP 401.
- Preserve login epoch, refresh token, and unknown credential fields.
- Add DSH settings and model-picker screenshots.

## 0.1.2

- Initial cloud API key prototype.
