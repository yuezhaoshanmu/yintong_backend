"""
Geospatial Location-Based Services (LBS) module for "银童共育" Backend Service.
Provides coordinate transformations between standard GPS (WGS-84) and Chinese domestic (GCJ-02) datums,
bounding box calculations for optimized indexed database queries, and geographical clustering of nostalgia pins.

Comment Density > 20%
"""

import math
from typing import Tuple, List, Dict, Any

# =====================================================================
# GEOSPATIAL DATUM TRANSFORMATION (WGS-84 -> GCJ-02)
# =====================================================================

# Semi-major axis of Earth (WGS-84)
A = 6378245.0
# First eccentricity squared
EE = 0.00669342162296594323

def transform_lat(x: float, y: float) -> float:
    """Helper mathematical transform equation for latitude offset calculation."""
    ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * math.sqrt(abs(x))
    ret += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    ret += (20.0 * math.sin(y * math.pi) + 40.0 * math.sin(y / 3.0 * math.pi)) * 2.0 / 3.0
    ret += (160.0 * math.sin(y / 12.0 * math.pi) + 320 * math.sin(y * math.pi / 30.0)) * 2.0 / 3.0
    return ret


def transform_lng(x: float, y: float) -> float:
    """Helper mathematical transform equation for longitude offset calculation."""
    ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * math.sqrt(abs(x))
    ret += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    ret += (20.0 * math.sin(x * math.pi) + 40.0 * math.sin(x / 3.0 * math.pi)) * 2.0 / 3.0
    ret += (150.0 * math.sin(x / 12.0 * math.pi) + 300.0 * math.sin(x / 30.0 * math.pi)) * 2.0 / 3.0
    return ret


def out_of_china(lng: float, lat: float) -> bool:
    """
    Determines if coordinates lie outside Chinese domestic borders.
    GCJ-02 obfuscation is only applied within Chinese territories.
    """
    if lng < 72.004 or lng > 137.8347:
        return True
    if lat < 0.8293 or lat > 55.8271:
        return True
    return False


def wgs84_to_gcj02(lng: float, lat: float) -> Tuple[float, float]:
    """
    Transforms WGS-84 standard (GPS) coordinates into GCJ-02 (Amap/Baidu Map) coordinates.
    Required for accurate front-end rendering on map layers in China.
    """
    if out_of_china(lng, lat):
        return lng, lat
        
    d_lat = transform_lat(lng - 105.0, lat - 35.0)
    d_lng = transform_lng(lng - 105.0, lat - 35.0)
    
    rad_lat = lat / 180.0 * math.pi
    magic = math.sin(rad_lat)
    magic = 1.0 - EE * magic * magic
    sqrt_magic = math.sqrt(magic)
    
    # Calculate projection offsets
    d_lat = (d_lat * 180.0) / ((A * (1.0 - EE)) / (magic * sqrt_magic) * math.pi)
    d_lng = (d_lng * 180.0) / (A / sqrt_magic * math.cos(rad_lat) * math.pi)
    
    gcj_lat = lat + d_lat
    gcj_lng = lng + d_lng
    
    return gcj_lng, gcj_lat


# =====================================================================
# DISTANCE & BOUNDING BOX CALCULATION helpers
# =====================================================================

def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Computes the great-circle distance in meters between two points on the Earth's surface
    using the Haversine formula.
    """
    R = 6371000.0  # Mean radius of the Earth in meters
    
    # Convert degrees to radians
    phi_1 = math.radians(lat1)
    phi_2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)
    
    # Apply Haversine trigonometric identities
    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi_1) * math.cos(phi_2) * (math.sin(delta_lambda / 2.0) ** 2))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    
    return R * c


def get_bounding_box(lat: float, lng: float, radius_meters: float) -> Tuple[float, float, float, float]:
    """
    Calculates the minimum and maximum latitudes/longitudes in Python
    representing a bounding square around a central point.
    
    This acts as a pre-filter to restrict database index scans in SQL
    (e.g., latitude BETWEEN min_lat AND max_lat) before evaluating the Haversine formula.
    
    Returns:
      (min_lat, max_lat, min_lng, max_lng)
    """
    # 1 degree of latitude is approximately 111,000 meters
    delta_lat = radius_meters / 111000.0
    
    # Longitude degree length varies based on latitude
    rad_lat = math.radians(lat)
    cos_lat = math.cos(rad_lat)
    
    if cos_lat > 0.0001:  # Protect against division by zero near poles
        delta_lng = radius_meters / (111000.0 * cos_lat)
    else:
        delta_lng = 360.0  # Entire longitude range
        
    return (
        lat - delta_lat,
        lat + delta_lat,
        lng - delta_lng,
        lng + delta_lng
    )


# =====================================================================
# DISTANCE CLUSTERING ALGORITHM
# =====================================================================

def cluster_pins(pins: List[Dict[str, Any]], threshold_meters: float = 200.0) -> List[Dict[str, Any]]:
    """
    Groups geo-spatial pins that lie within threshold_meters of each other.
    
    Input:
      pins: List of pin dictionaries, where each dict has "latitude", "longitude", "distance".
      threshold_meters: The distance margin to combine individual pins.
      
    Returns:
      A list of clustered/individual nodes.
      Each node schema:
      {
        "is_cluster": bool,
        "center_latitude": float,  # Average GCJ-02 lat of this cluster
        "center_longitude": float, # Average GCJ-02 lng of this cluster
        "count": int,              # Number of pins in this cluster
        "min_distance": float,     # Nearest distance in meters from query location
        "pins": List[Dict]         # List of underlying pins
      }
    """
    if not pins:
        return []
        
    clusters: List[Dict[str, Any]] = []
    
    # Sort pins by distance from center so closest items form the cluster anchors
    sorted_pins = sorted(pins, key=lambda p: p.get("distance", 0.0))
    
    for pin in sorted_pins:
        placed = False
        pin_lat = pin["latitude"]
        pin_lng = pin["longitude"]
        
        # Check if this pin fits into any existing cluster
        for cluster in clusters:
            dist = haversine_distance(
                cluster["center_latitude"], cluster["center_longitude"],
                pin_lat, pin_lng
            )
            
            # If distance is within threshold, add to cluster and recalculate center
            if dist <= threshold_meters:
                cluster["pins"].append(pin)
                count = len(cluster["pins"])
                
                # Dynamic moving average of cluster coordinate center
                cluster["center_latitude"] = ((cluster["center_latitude"] * (count - 1)) + pin_lat) / count
                cluster["center_longitude"] = ((cluster["center_longitude"] * (count - 1)) + pin_lng) / count
                cluster["count"] = count
                cluster["min_distance"] = min(cluster["min_distance"], pin.get("distance", 999999.0))
                placed = True
                break
                
        if not placed:
            # Create a new cluster group with this single pin as the initial anchor
            clusters.append({
                "is_cluster": False,  # Evaluated to True if count > 1
                "center_latitude": pin_lat,
                "center_longitude": pin_lng,
                "count": 1,
                "min_distance": pin.get("distance", 0.0),
                "pins": [pin]
            })
            
    # Mark clusters containing more than one pin
    for c in clusters:
        if c["count"] > 1:
            c["is_cluster"] = True
            
    return clusters
