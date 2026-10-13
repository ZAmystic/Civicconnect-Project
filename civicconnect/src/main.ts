import express from "express";
import userRoutes from "./routes/user_route";
import settingsRouter from "./routes/settings_route";
import facilityFaultRoutes from "./routes/facility_fault_routes";
import requestRoutes from "./routes/request_routes";

const app = express();

const PORT = 3000;

// Parse incoming JSON requests
app.use(express.json());

// Register user REST API routes
app.use("/api/users", userRoutes);
app.use("/api/settings", settingsRouter);
app.use("/api/facility-faults", facilityFaultRoutes);
app.use("/api/requests", requestRoutes);

// Basic API health check
app.get("/api/health", (_req, res) => {
    res.json({
        success: true,
        message: "CivicConnect API is running."
    });
});

// Start server
app.listen(PORT, () => {
    console.log(
        `Server running at http://localhost:${PORT}`
    );
});
