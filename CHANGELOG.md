# Changelog

## 0.3.0

- Add per-model 512K / 1M context budgets for MiniMax M3 and M3.1 Flash.
- Add MiniMax native reasoning efforts, including `default`, with DSH override control.
- Apply fixed reasoning effort in the loopback proxy as adaptive `output_config`.
- Add bulk context and effort controls to the DSH settings card.

## 0.2.2

- Add an explicit DSH runtime range for market indexes.
- Add the standard format-1 market index.

## 0.2.1

- Read the existing MiniMax Code sign-in instead of asking for an API key.
- Forward Anthropic Messages requests through a loopback-only reverse proxy.
- Refresh credentials only when near expiry or rejected with HTTP 401.
- Preserve login epoch, refresh token, and unknown credential fields.
- Add DSH settings and model-picker screenshots.

## 0.1.2

- Initial cloud API key prototype.
