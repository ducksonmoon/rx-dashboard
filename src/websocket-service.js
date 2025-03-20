import { Observable, Subject, interval, of, throwError } from "rxjs";
import { webSocket } from "rxjs/webSocket";
import {
  catchError,
  map,
  switchMap,
  filter,
  retryWhen,
  delay,
  share,
  takeUntil,
} from "rxjs/operators";

// In a real app, this would point to your actual WebSocket server
const WS_ENDPOINT = "wss://stream.binance.com:9443/ws/!ticker@arr";

export class WebSocketService {
  constructor() {
    // Subject for manually closing the connection
    this.closeSubject = new Subject();

    // Create connection status observable
    this.connectionStatus$ = new Subject();

    // Create a WebSocket subject that can multicast to multiple subscribers
    this.socket$ = webSocket({
      url: WS_ENDPOINT,
      openObserver: {
        next: () => {
          console.log("WebSocket connected!");
          this.connectionStatus$.next("connected");
        },
      },
      closeObserver: {
        next: () => {
          console.log("WebSocket closed");
          this.connectionStatus$.next("disconnected");
        },
      },
    });

    // Create shared, auto-reconnecting data stream
    this.data$ = this.socket$.pipe(
      // Retry with exponential backoff
      retryWhen((errors) =>
        errors.pipe(
          delay(1000),
          map((error, i) => {
            if (i >= 5) {
              throw error; // Give up after 5 retries
            }
            console.log(`Retrying connection (${i + 1})...`);
            this.connectionStatus$.next("reconnecting");
            return i;
          })
        )
      ),
      // Filter out non-array responses
      filter((data) => Array.isArray(data)),
      // Only take data until a close is signaled
      takeUntil(this.closeSubject),
      // Process the incoming data
      map((data) => this.processBinanceData(data)),
      // Add error handling
      catchError((error) => {
        console.error("WebSocket error:", error);
        this.connectionStatus$.next("error");
        // Return an empty result instead of error
        return of({ cryptos: [], timestamp: Date.now() });
      }),
      // Use share() to multicast the data to multiple subscribers
      share()
    );

    // Set up heartbeat to detect disconnects
    this.heartbeat$ = interval(30000).pipe(
      takeUntil(this.closeSubject),
      switchMap(() => {
        if (this.socket$.closed) {
          console.log("Socket closed, attempting to reconnect");
          return throwError(() => new Error("Disconnected"));
        }
        return of(null);
      }),
      catchError(() => {
        this.reconnect();
        return of(null);
      })
    );

    // Start the heartbeat
    this.heartbeat$.subscribe();
  }

  // Process Binance data format into our app format
  processBinanceData(data) {
    // We're only interested in a few major cryptocurrencies
    const tickers = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "ADAUSDT"];
    const filtered = data.filter((item) => tickers.includes(item.s));

    return {
      cryptos: filtered.map((item) => ({
        symbol: item.s.replace("USDT", ""),
        price: parseFloat(item.c),
        priceChange: parseFloat(item.P),
        volume: parseFloat(item.v),
        // Calculate a volume score from 1-10 for visualization
        volumeScore: Math.min(10, Math.ceil(Math.log(parseFloat(item.v)) / 10)),
      })),
      timestamp: Date.now(),
    };
  }

  // Method to get data as an observable
  getData() {
    return this.data$;
  }

  // Get connection status as observable
  getConnectionStatus() {
    return this.connectionStatus$.asObservable();
  }

  // Manual reconnect method
  reconnect() {
    this.socket$.complete();
    this.socket$.connect();
    this.connectionStatus$.next("connecting");
  }

  // Clean close of the WebSocket
  close() {
    this.closeSubject.next();
    this.closeSubject.complete();
    this.socket$.complete();
  }
}