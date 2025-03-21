import { fromEvent, Subject, merge } from "rxjs";
import {
  map,
  debounceTime,
  distinctUntilChanged,
  throttleTime,
  takeUntil,
  scan,
  buffer,
  switchMap,
  tap,
} from "rxjs/operators";

export class Dashboard {
  constructor(websocketService) {
    this.websocketService = websocketService;
    this.destroy$ = new Subject();
    this.lastPrices = new Map();

    // DOM references
    this.dashboardEl = document.getElementById("dashboard");
    this.lastUpdatedEl = document.getElementById("last-updated");
    this.connectionStatusEl = document.getElementById("connection-status");
    this.alertsEl = document.getElementById("alerts");

    this.initialize();
  }

  initialize() {
    // Observe connection status changes
    this.websocketService
      .getConnectionStatus()
      .pipe(takeUntil(this.destroy$))
      .subscribe((status) => {
        this.updateConnectionStatus(status);
      });

    // Main data stream
    const data$ = this.websocketService.getData();

    // Update dashboard with latest prices
    data$
      .pipe(
        takeUntil(this.destroy$)
        // This is where reactive programming really helps - we can derive multiple streams
        // from a single data source for different purposes
      )
      .subscribe((data) => {
        this.updateDashboard(data);
      });

    // Create a separate stream just for price alerts
    // This shows the power of creating derived streams with different operators
    data$
      .pipe(
        takeUntil(this.destroy$),
        // Use scan to keep track of previous values and detect big changes
        // Think of scan like a snowball rolling downhill, gathering data as it goes
        scan(
          (acc, data) => {
            const alerts = [];

            data.cryptos.forEach((crypto) => {
              const prev = acc.prices.get(crypto.symbol);
              if (prev) {
                // Calculate percent change since last update
                const pctChange = ((crypto.price - prev) / prev) * 100;

                // Alert on significant changes (more than 0.5% in a single update)
                if (Math.abs(pctChange) > 0.5) {
                  alerts.push({
                    symbol: crypto.symbol,
                    price: crypto.price,
                    change: pctChange,
                    isPositive: pctChange > 0,
                  });
                }
              }

              // Update our tracking map with latest price
              acc.prices.set(crypto.symbol, crypto.price);
            });

            return {
              prices: acc.prices,
              alerts,
            };
          },
          { prices: new Map(), alerts: [] }
        ),
        // Only proceed when there are alerts
        map((result) => result.alerts),
        filter((alerts) => alerts.length > 0)
      )
      .subscribe((alerts) => {
        this.showAlerts(alerts);
      });

    // Create a separate stream for volume analysis
    data$
      .pipe(
        takeUntil(this.destroy$),
        map((data) => {
          // Calculate total volume across all cryptos
          const totalVolume = data.cryptos.reduce(
            (sum, crypto) => sum + crypto.volume,
            0
          );
          return {
            totalVolume,
            cryptos: data.cryptos,
          };
        })
        // We could do sophisticated volume analysis here
      )
      .subscribe((volumeData) => {
        // For now, we're just using this for our UI volume bars
        // but in a real app, you might generate volume-based trading signals
      });
  }

  updateDashboard(data) {
    // Update "last updated" timestamp
    const date = new Date(data.timestamp);
    this.lastUpdatedEl.textContent = date.toLocaleTimeString();

    // Update or create cards for each cryptocurrency
    data.cryptos.forEach((crypto) => {
      let cardEl = document.getElementById(`crypto-${crypto.symbol}`);

      // If this crypto doesn't have a card yet, create one
      if (!cardEl) {
        cardEl = document.createElement("div");
        cardEl.id = `crypto-${crypto.symbol}`;
        cardEl.className = "crypto-card";
        cardEl.innerHTML = `
          <h2>${crypto.symbol}</h2>
          <div class="price">$${crypto.price.toFixed(2)}</div>
          <div class="price-change ${
            crypto.priceChange >= 0 ? "rising" : "falling"
          }">
            ${crypto.priceChange >= 0 ? "▲" : "▼"} ${Math.abs(
          crypto.priceChange
        ).toFixed(2)}%
          </div>
          <div class="volume">
            Volume: ${this.formatVolume(crypto.volume)}
            <div class="volume-bar">
              <div class="volume-indicator" style="width: ${
                crypto.volumeScore * 10
              }%"></div>
            </div>
          </div>
        `;
        this.dashboardEl.appendChild(cardEl);
      } else {
        // Update existing card
        const priceEl = cardEl.querySelector(".price");
        const priceChangeEl = cardEl.querySelector(".price-change");
        const volumeBarEl = cardEl.querySelector(".volume-indicator");

        // Check if price changed to add flash effect
        const prevPrice = this.lastPrices.get(crypto.symbol) || crypto.price;
        const priceChanged = prevPrice !== crypto.price;

        if (priceChanged) {
          // Add flash effect class based on price direction
          const flashClass = crypto.price > prevPrice ? "rising" : "falling";
          priceEl.classList.add(flashClass);

          // Remove flash effect after animation completes
          setTimeout(() => priceEl.classList.remove(flashClass), 1000);
        }

        // Update values
        priceEl.textContent = `$${crypto.price.toFixed(2)}`;
        priceChangeEl.textContent = `${
          crypto.priceChange >= 0 ? "▲" : "▼"
        } ${Math.abs(crypto.priceChange).toFixed(2)}%`;
        priceChangeEl.className = `price-change ${
          crypto.priceChange >= 0 ? "rising" : "falling"
        }`;
        volumeBarEl.style.width = `${crypto.volumeScore * 10}%`;
      }

      // Store current price for next comparison
      this.lastPrices.set(crypto.symbol, crypto.price);
    });
  }

  updateConnectionStatus(status) {
    this.connectionStatusEl.className = status;

    switch (status) {
      case "connected":
        this.connectionStatusEl.textContent = "Connected";
        break;
      case "disconnected":
        this.connectionStatusEl.textContent =
          "Disconnected - Click to reconnect";
        break;
      case "reconnecting":
        this.connectionStatusEl.textContent = "Reconnecting...";
        break;
      case "connecting":
        this.connectionStatusEl.textContent = "Connecting...";
        break;
      default:
        this.connectionStatusEl.textContent =
          "Connection Error - Click to retry";
        break;
    }
  }

  showAlerts(alerts) {
    alerts.forEach((alert) => {
      const alertEl = document.createElement("div");
      alertEl.className = "alert";
      alertEl.innerHTML = `
        <strong>${alert.symbol}</strong> ${alert.isPositive ? "up" : "down"} 
        ${Math.abs(alert.change).toFixed(2)}% to $${alert.price.toFixed(2)}
      `;

      this.alertsEl.appendChild(alertEl);

      // Remove alert after 5 seconds
      setTimeout(() => {
        if (alertEl.parentNode === this.alertsEl) {
          alertEl.style.opacity = "0";
          setTimeout(() => this.alertsEl.removeChild(alertEl), 300);
        }
      }, 5000);
    });
  }

  formatVolume(volume) {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(2)}M`;
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(2)}K`;
    }
    return volume.toFixed(2);
  }

  destroy() {
    // Clean up all subscriptions
    this.destroy$.next();
    this.destroy$.complete();
  }
}