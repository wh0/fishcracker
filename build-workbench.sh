#!/bin/sh -eux
TW_PORT=9988
rm -rf \
  ~/greeter/workbench.html \
  ~/greeter/callback.html \
  ~/greeter/static/build
npx @vscode/test-web \
  --quality stable \
  --esm \
  --port "$TW_PORT" \
  --browser none \
  --testRunnerDataDir /tmp/vscode-test-web \
  --extensionDevelopmentPath ~/devextensions-links \
  &
server_pid=$!
while ! curl -sf -o /dev/null "http://localhost:$TW_PORT/static/build/LICENSE"; do
  sleep 1
done
cp -r /tmp/vscode-test-web/* ~/greeter/static/build
curl -sSfo /tmp/greeter-workbench-localhost.html "http://localhost:$TW_PORT/"
sed \
  "
  s/&quot;webEndpointUrlTemplate&quot;:&quot;[^&]*&quot;/\\&quot;webEndpointUrlTemplate\\&quot;:\\&quot;\\&quot;/g;
  s/&quot;webviewContentExternalBaseUrlTemplate&quot;:&quot;[^&]*&quot;/\\&quot;webviewContentExternalBaseUrlTemplate\\&quot;:\\&quot;\\&quot;/g;
  s/http:\\/\\/localhost:$TW_PORT/https:\\/\\/$PROJECT_DOMAIN.glitch.me/g;
  s/&quot;scheme&quot;:&quot;http&quot;,&quot;authority&quot;:&quot;localhost:$TW_PORT&quot;/\\&quot;scheme\\&quot;:\\&quot;https\\&quot;,\\&quot;authority\\&quot;:\\&quot;$PROJECT_DOMAIN.glitch.me\\&quot;/g
  " \
  /tmp/greeter-workbench-localhost.html \
  >~/greeter/workbench.html
curl -sSfo ~/greeter/callback.html "http://localhost:$TW_PORT/callback"
kill "$server_pid"
wait
