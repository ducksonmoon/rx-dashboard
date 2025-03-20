import { Subject, merge, interval } from "rxjs";
import {
  map,
  buffer,
  scan,
  filter,
  debounceTime,
  sample,
  distinctUntilChanged,
} from "rxjs/operators";

export class Dashboard {
  constructor(websocketService) {
    this.websocketService = websocketService;

    // Track manual refresh requests
    this.refreshSubject = new Subject();

    // Set up all the observables
    this.setupObservables();

    // Set up DOM elements
    this.cryptoListElem = document.getElementById("crypto-list");
    this.connectionStatusElem = document.getElementById("connection-status");
    this.connectionInfoElem = document.getElementById("connection-info");
    this.lastUpdateElem = document.getElementById("last-update");
    this.alertsContainerElem = document.getElementById("alerts-container");

    // Initialize the dashboard
    this.initialize();
  }

  setupObservables() {
    // Get the base data stream
    this.data$ = this.websocketService.getData();

    // Transform data for UI updates (with throttling)
    this.uiData$ = this.data$.pipe(
      sample(interval(1000)) // Only update UI max once per second to prevent flicker
    );

    // Create price alert observable using a buffer strategy
    this.priceAlerts$ = this.data$.pipe(
      // First, create a stream of all crypto updates
      map((data) => data.cryptos),
      // Explode the array (turn one array into multiple emissions, one for each crypto)
      map((cryptos) => cryptos.flatMap((crypto) => ({ ...crypto }))),
      // Buffer for 5 minutes for each symbol separately
      buffer(interval(5 * 60 * 1000)), // 5 minutes buffer
      // Only continue if buffer has items
      filter((buffer) => buffer.length > 0),
      // Group buffered items by symbol
      map((buffer) => {
        // Group by symbol
        const bySymbol = buffer.reduce((acc, item) => {
          if (!acc[item.symbol]) acc[item.symbol] = [];
          acc[item.symbol].push(item);
          return acc;
        }, {});

        // For each symbol, check if there's a significant price change
        return Object.entries(bySymbol)
          .map(([symbol, items]) => {
            if (items.length < 2) return null;

            const first = items[0].price;
            const last = items[items.length - 1].price;
            const pctChange = ((last - first) / first) * 100;

            // Only alert if change is significant (more than 1% in 5 min)
            if (Math.abs(pctChange) >= 1) {
              return {
                symbol,
                pctChange: pctChange.toFixed(2),
                isUp: pctChange > 0,
                timestamp: Date.now(),
              };
            }
            return null;
          })
          .filter((item) => item !== null);
      }),
      // Flatten the results
      map((alerts) => alerts.flat())
    );

    // Create volume alert observable
    this.volumeAlerts$ = this.data$.pipe(
      // Debounce so we don't process every single update
      debounceTime(10000), // Check every 10 seconds
      // Track volume state over time using scan
      scan(
        (acc, data) => {
          // Initialize or update with the latest data
          if (!acc.prev) {
            return {
              prev: data.cryptos,
              alerts: [],
            };
          }

          // Compare current volumes with previous
          const alerts = data.cryptos
            .map((current) => {
              const prev = acc.prev.find((p) => p.symbol === current.symbol);
              if (!prev) return null;

              // Check for significant volume increase (20%+)
              const volumeIncrease =
                (current.volume - prev.volume) / prev.volume;
              if (volumeIncrease > 0.2) {
                // 20% threshold
                return {
                  symbol: current.symbol,
                  volumeIncrease: (volumeIncrease * 100).toFixed(0),
                  timestamp: Date.now(),
                };
              }
              return null;
            })
            .filter((alert) => alert !== null);

          return {
            prev: data.cryptos,
            alerts,
          };
        },
        { prev: null, alerts: [] }
      ),
      // Only emit when there are new alerts
      filter((result) => result.alerts.length > 0),
      map((result) => result.alerts)
    );

    // Connection status with simpler display text
    this.connectionStatus$ = this.websocketService.getConnectionStatus().pipe(
      map((status) => {
        switch (status) {
          case "connected":
            return { text: "Connected", class: "connected" };
          case "disconnected":
            return { text: "Disconnected", class: "disconnected" };
          case "connecting":
            return { text: "Connecting...", class: "disconnected" };
          case "reconnecting":
            return { text: "Reconnecting...", class: "disconnected" };
          case "error":
            return { text: "Connection Error", class: "disconnected" };
          default:
            return { text: "Unknown", class: "" };
        }
      })
    );

    // Last update time
    this.lastUpdate$ = this.data$.pipe(
      map((data) => {
        const time = new Date(data.timestamp);
        return time.toLocaleTimeString();
      })
    );

    // Combine all alerts into a single stream for the UI
    this.allAlerts$ = merge(
      this.priceAlerts$.pipe(
        map((alerts) =>
          alerts.map((a) => ({
            text: `${a.symbol} price ${
              a.isUp ? "jumped" : "dropped"
            } ${Math.abs(a.pctChange)}% in last 5 minutes`,
            timestamp: a.timestamp,
            type: "price",
          }))
        )
      ),
      this.volumeAlerts$.pipe(
        map((alerts) =>
          alerts.map((a) => ({
            text: `${a.symbol} volume spike detected: +${a.volumeIncrease}%`,
            timestamp: a.timestamp,
            type: "volume",
          }))
        )
      )
    ).pipe(
      scan((allAlerts, newAlerts) => {
        // Add new alerts and keep the list at max 5 items
        return [...newAlerts, ...allAlerts].slice(0, 5);
      }, [])
    );
  }

  initialize() {
    // Subscribe to UI updates
    this.uiData$.subscribe((data) => this.updateCryptoList(data));

    // Subscribe to connection status
    this.connectionStatus$.subscribe((status) => {
      this.connectionStatusElem.textContent = status.text;
      this.connectionStatusElem.className = status.class;
      this.connectionInfoElem.textContent =
        status.class === "connected"
          ? "Live data streaming"
          : "Waiting for connection...";
    });

    // Subscribe to last update time
    this.lastUpdate$.subscribe((time) => {
      this.lastUpdateElem.textContent = `Last update: ${time}`;
    });

    // Subscribe to alerts
    this.allAlerts$.subscribe((alerts) => {
      this.alertsContainerElem.innerHTML = "";

      if (alerts.length === 0) {
        this.alertsContainerElem.innerHTML = "<p>No alerts yet</p>";
        return;
      }

      alerts.forEach((alert) => {
        const alertElem = document.createElement("div");
        alertElem.className = `alert-item alert-${alert.type}`;
        alertElem.textContent = alert.text;
        this.alertsContainerElem.appendChild(alertElem);
      });
    });
  }

  updateCryptoList(data) {
    this.cryptoListElem.innerHTML = "";

    data.cryptos.forEach((crypto) => {
      const isUp = crypto.priceChange >= 0;
      const priceChangeClass = isUp ? "price-up" : "price-down";

      const cryptoItemElem = document.createElement("div");
      cryptoItemElem.className = "crypto-item";

      cryptoItemElem.innerHTML = `
        <div class="crypto-price">
          <strong>${crypto.symbol}:</strong> 
          $${crypto.price.toFixed(2)}
          <span class="${priceChangeClass}">
            (${isUp ? "+" : ""}${crypto.priceChange.toFixed(2)}%)
          </span>
        </div>
        <div class="crypto-volume">
          Volume: 
          <div class="volume-bar">
            <div class="volume-fill" style="width: ${
              crypto.volumeScore * 10
            }%"></div>
          </div>
        </div>
      `;

      this.cryptoListElem.appendChild(cryptoItemElem);
    });
  }

  // Method to manually trigger a refresh
  refresh() {
    this.refreshSubject.next();
  }

  // Clean up
  destroy() {
    this.websocketService.close();
  }
}