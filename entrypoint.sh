SLEEP_SECONDS="${SLEEP_SECONDS:-3600}"

while true; do
  node /app/script.js
  echo "--- Sleeping for ${SLEEP_SECONDS} seconds ---"
  sleep "$SLEEP_SECONDS"
done