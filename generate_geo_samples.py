"""Generate fresh geolocation samples for testing /auth/login in Insomnia."""

import argparse
import json
import math
import time


def build_geo_samples(
    start_lat: float = 6.597806,
    start_lng: float = 3.339668,
    accuracy: float = 150,
    count: int = 4,
    interval_ms: int = 655,
    speed_mps: float = 1.5,
    heading_deg: float = 0.0,
) -> list[dict]:
    """Build a sequence of fresh GPS samples moving along the given heading."""
    now_ms = int(time.time() * 1000)
    base_ms = now_ms - (count - 1) * interval_ms

    # Distance moved per interval in meters, converted to degrees
    step_m = speed_mps * (interval_ms / 1000.0)
    rad = math.radians(heading_deg)
    d_lat = (step_m * math.cos(rad)) / 111_111.0
    d_lng = (step_m * math.sin(rad)) / (111_111.0 * math.cos(math.radians(start_lat)))

    samples = []
    for i in range(count):
        captured_at = base_ms + i * interval_ms
        samples.append(
            {
                "lat": round(start_lat + i * d_lat, 6),
                "lng": round(start_lng + i * d_lng, 6),
                "accuracy": accuracy,
                "captured_at": captured_at,
                "provider_ts": captured_at - 100,
                "speed": speed_mps,
                "heading": heading_deg,
                "altitude": None,
            }
        )
    return samples


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate fresh geo_samples and coordinates for /auth/login testing."
    )
    parser.add_argument("--lat", type=float, default=6.597806, help="Starting latitude")
    parser.add_argument("--lng", type=float, default=3.339668, help="Starting longitude")
    parser.add_argument("--accuracy", type=float, default=150, help="GPS accuracy in meters")
    parser.add_argument("--count", type=int, default=4, help="Number of samples")
    parser.add_argument("--interval-ms", type=int, default=655, help="Interval between samples (ms)")
    parser.add_argument("--speed", type=float, default=1.5, help="Speed in m/s")
    parser.add_argument("--heading", type=float, default=0.0, help="Heading in degrees (0=North)")
    args = parser.parse_args()

    samples = build_geo_samples(
        start_lat=args.lat,
        start_lng=args.lng,
        accuracy=args.accuracy,
        count=args.count,
        interval_ms=args.interval_ms,
        speed_mps=args.speed,
        heading_deg=args.heading,
    )
    last = samples[-1]

    print(f"latitude:     {last['lat']}")
    print(f"longitude:    {last['lng']}")
    print(f"geo_accuracy: {last['accuracy']}")
    print(f"geo_samples:  {json.dumps(samples, separators=(',', ':'))}")


if __name__ == "__main__":
    main()
