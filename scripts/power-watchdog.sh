#!/bin/bash
LOG_FILE="/var/log/power-history.log"
TELEGRAM_TOKEN="YOUR_TELEGRAM_BOT_TOKEN"
CHAT_ID="YOUR_TELEGRAM_CHAT_ID"

BOOT_TIME=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$BOOT_TIME] [POWER ON] System booted up (AC Power Restored)." >> "$LOG_FILE"
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
     -d chat_id="${CHAT_ID}" \
     -d text="⚡ [POWER RESTORED] Laptop is back online at: ${BOOT_TIME}" > /dev/null

UNPLUGGED_SECONDS=0

while true; do
    if acpi -a | grep -q "off-line"; then
        UNPLUGGED_SECONDS=$((UNPLUGGED_SECONDS + 5))
        if [ "$UNPLUGGED_SECONDS" -eq 5 ]; then
            WARN_TIME=$(date '+%Y-%m-%d %H:%M:%S')
            echo "[$WARN_TIME] [WARNING] AC Charger disconnected!" >> "$LOG_FILE"
        fi

        if [ "$UNPLUGGED_SECONDS" -ge 60 ]; then
            DOWN_TIME=$(date '+%Y-%m-%d %H:%M:%S')
            echo "[$DOWN_TIME] [AUTO SHUTDOWN] No AC power for 60s. Initiating Safe Shutdown." >> "$LOG_FILE"
            curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
                 -d chat_id="${CHAT_ID}" \
                 -d text="🚨 [POWER OUTAGE] Charger disconnected for 1 minute (${DOWN_TIME}). Initiating Auto Safe Shutdown now!" > /dev/null
            /sbin/shutdown -h now
            exit 0
        fi
    else
        UNPLUGGED_SECONDS=0
    fi
    sleep 5
done
