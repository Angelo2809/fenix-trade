from starlette.responses import JSONResponse


class BodyTooLarge(Exception):
    pass


class BodyLimitMiddleware:
    """Bound streamed/chunked multipart bodies before the parser spools to disk."""

    def __init__(self, app, settings):
        self.app = app
        self.settings = settings

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        received = 0
        started = False
        oversized = False
        maximum = self.settings.max_upload_size_mb * 1024 * 1024 + 65536

        async def bounded_receive():
            nonlocal received, oversized
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > maximum:
                    oversized = True
                    raise BodyTooLarge()
            return message

        async def bounded_send(message):
            nonlocal started
            if oversized:
                return
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, bounded_receive, bounded_send)
        except BodyTooLarge:
            oversized = True
        if oversized and not started:
            await JSONResponse({"detail": "Arquivo excede o tamanho permitido."}, status_code=413)(scope, receive, send)
