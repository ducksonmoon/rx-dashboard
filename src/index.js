import { WebSocketService } from "./websocket-service.js";
import { Dashboard } from "./dashboard.js";

// Initialize the services when the DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  console.log("Initializing dashboard...");

  // Create the websocket service
  const websocketService = new WebSocketService();

  // Create the dashboard
  const dashboard = new Dashboard(websocketService);

  // Handle manual reconnect clicks
  document.getElementById("connection-status").addEventListener("click", () => {
    console.log("Manual reconnect requested");
    websocketService.reconnect();
  });

  // Clean up on page unload
  window.addEventListener("beforeunload", () => {
    dashboard.destroy();
  });
});