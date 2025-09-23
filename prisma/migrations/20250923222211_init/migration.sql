-- CreateTable
CREATE TABLE "public"."Vehicle" (
    "id" TEXT NOT NULL,
    "imei" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Ride" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Ride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Ping" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "rideId" TEXT,
    "ts" TIMESTAMP(3) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "speedKph" DOUBLE PRECISION,

    CONSTRAINT "Ping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_imei_key" ON "public"."Vehicle"("imei");

-- CreateIndex
CREATE INDEX "Ride_vehicleId_startedAt_idx" ON "public"."Ride"("vehicleId", "startedAt");

-- CreateIndex
CREATE INDEX "Ping_vehicleId_ts_idx" ON "public"."Ping"("vehicleId", "ts");

-- AddForeignKey
ALTER TABLE "public"."Ride" ADD CONSTRAINT "Ride_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "public"."Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ping" ADD CONSTRAINT "Ping_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "public"."Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ping" ADD CONSTRAINT "Ping_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "public"."Ride"("id") ON DELETE SET NULL ON UPDATE CASCADE;
