import asyncio
import json
import ssl      # LARRY <-- Import the ssl module
import certifi  # LARRY <-- Import the certifi module

import websockets.exceptions
import websockets
from websockets.legacy.protocol import WebSocketCommonProtocol
from websockets.legacy.server import WebSocketServerProtocol

# HOST = "us-central1-autopush-aiplatform.sandbox.googleapis.com"
# !!! Need to change this as well to make the environment switch work.
HOST = "us-central1-autopush-aiplatform.sandbox.googleapis.com"
# HOST = "us-central1-aiplatform.googleapis.com"
# SERVICE_URL = f"wss://{HOST}/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent"
SERVICE_URL = f"wss://{HOST}/ws/google.cloud.aiplatform.internal.LlmBidiService/BidiGenerateContent"

DEBUG = False


async def proxy_task(
    client_websocket: WebSocketCommonProtocol, server_websocket: WebSocketCommonProtocol
) -> None:
    """
    Forwards messages from one WebSocket connection to another.

    Args:
        client_websocket: The WebSocket connection from which to receive messages.
        server_websocket: The WebSocket connection to which to send messages.
    """
    # This task will end when the client_websocket connection is closed.
    async for message in client_websocket:
        if DEBUG:
            print("proxying: ", message)
        await server_websocket.send(message)


async def proxy(client_websocket, server_websocket):
    """
    Manages the bidirectional message forwarding and handles connection closures.
    """
    try:
        # Create two tasks for forwarding messages in both directions
        client_to_server_task = asyncio.create_task(
            proxy_task(client_websocket, server_websocket)
        )
        server_to_client_task = asyncio.create_task(
            proxy_task(server_websocket, client_websocket)
        )
        # Wait for either task to complete (which happens on connection close)
        await asyncio.gather(client_to_server_task, server_to_client_task)
    except websockets.exceptions.ConnectionClosed as e:
        print(f"Connection closed: code = {e.code}, reason = {e.reason}")
        # When one connection closes, ensure the other is closed with the same code and reason.
        if not client_websocket.closed:
            await client_websocket.close(e.code, e.reason)
        if not server_websocket.closed:
            await server_websocket.close(e.code, e.reason)


async def create_proxy(
    client_websocket: WebSocketCommonProtocol, bearer_token: str
) -> None:
    """
    Establishes a WebSocket connection to the server and creates two tasks for
    bidirectional message forwarding between the client and the server.

    Args:
        client_websocket: The WebSocket connection of the client.
        bearer_token: The bearer token for authentication with the server.
    """

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {bearer_token}",
    }

    # LARRY
    # This creates a secure context using certifi's trusted certificates.
    # It ensures Python can verify Google's SSL certificate.
    ssl_context = ssl.create_default_context(cafile=certifi.where())

    async with websockets.connect(
        SERVICE_URL, additional_headers=headers, ssl=ssl_context  # LARRY <-- Pass the secure SSL context here
    ) as server_websocket:
        # Start the bidirectional proxy
        await proxy(client_websocket, server_websocket)


async def handle_client(client_websocket: WebSocketServerProtocol) -> None:
    """
    Handles a new client connection, expecting the first message to contain a bearer token.
    Establishes a proxy connection to the server upon successful authentication.

    Args:
        client_websocket: The WebSocket connection of the client.
    """
    print("New connection...")
    # Wait for the first message from the client
    try:
        auth_message = await asyncio.wait_for(client_websocket.recv(), timeout=5.0)
        auth_data = json.loads(auth_message)
    
        if "bearer_token" in auth_data:
            bearer_token = auth_data["bearer_token"]
        else:
            print("Error: Bearer token not found in the first message.")
            await client_websocket.close(code=1008, reason="Bearer token missing")
            return
    except Exception as e:
        print(f"Error during authentication: {e}")
        await client_websocket.close(code=1011, reason=f"Authentication error: {e}")
        return
    await create_proxy(client_websocket, bearer_token)


async def main() -> None:
    """
    Starts the WebSocket server and listens for incoming client connections.
    """
    async with websockets.serve(handle_client, "localhost", 8080):
        print("Running local insecure websocket server localhost:8080...")
        # Run forever
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
