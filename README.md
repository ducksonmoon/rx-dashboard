# Real-Time Dashboard with Reactive Programming

This project demonstrates how to build a real-time dashboard using reactive programming principles. The dashboard connects to a WebSocket server and displays live updating cryptocurrency data.

## Features

- Live cryptocurrency price updates
- Trading volume indicators
- Price change alerts
- Connection status monitoring

## Prerequisites

- Node.js (v14+)
- npm or yarn
- Basic understanding of JavaScript and reactive programming concepts

## Project Structure

```
├── src/
│   ├── index.js            # Application entry point
│   ├── dashboard.js        # Dashboard UI and logic
│   └── websocket-service.js # WebSocket connection handler
├── index.html              # Main HTML template
├── webpack.config.js       # Webpack configuration
├── package.json            # Project dependencies
└── README.md               # This file
```

## Getting Started

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/rx-dashboard.git
cd rx-dashboard

# Install dependencies
npm install
```

### Running the Dashboard

```bash
# Start the development server
npm start
```

Open your browser and navigate to `http://localhost:8080` to see the dashboard in action.

## How It Works

This dashboard uses reactive programming with RxJS to handle asynchronous data streams from a WebSocket server. The application demonstrates several key reactive patterns:

1. **Data Streams**: Converting WebSocket messages into observable streams
2. **Operators**: Transforming, filtering, and combining data with RxJS operators
3. **Subscription Management**: Proper handling of subscriptions to prevent memory leaks
4. **Error Handling**: Graceful error recovery and reconnection logic

## Extending the Dashboard

You can extend this dashboard by:

- Adding new data visualizations
- Implementing additional data filters
- Creating custom alert conditions
- Adding historical data views

## Learn More

For a detailed explanation of this project, check out my blog post:
[Building a Real-Time Dashboard with Reactive Programming](https://ducksonmoon.ir/blog/post/building-a-real-time-dashboard-with-reactive-programming)

## License

MIT
