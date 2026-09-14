/**
 * Servicio de Geocercas y Cálculos Geodésicos
 * Implementa cálculo Haversine y algoritmo Ray-Casting (Point-in-Polygon)
 */

class GeofenceService {
  /**
   * Calcula la distancia en metros entre dos coordenadas geográficas usando Haversine
   */
  calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    
    const R = 6371e3; // Radio de la tierra en metros
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c); // Distancia redondeada a metros
  }

  /**
   * Determina si un punto [lat, lng] está dentro de un polígono usando Ray-Casting
   * @param {number} lat 
   * @param {number} lng 
   * @param {Array<[number, number]>} poligono Arreglo de pares [lat, lng]
   */
  puntoEnPoligono(lat, lng, poligono) {
    if (!Array.isArray(poligono) || poligono.length < 3) return false;

    let adentro = false;
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
      const xi = poligono[i][0], yi = poligono[i][1];
      const xj = poligono[j][0], yj = poligono[j][1];

      const intersecta =
        yi > lng !== yj > lng &&
        lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;

      if (intersecta) adentro = !adentro;
    }
    return adentro;
  }

  /**
   * Valida si un punto se encuentra dentro de una geocerca circular o poligonal
   */
  estaEnGeocerca(lat, lng, geocerca) {
    if (!geocerca || !geocerca.activo) return false;

    if (geocerca.tipo === 'Circular' && geocerca.centroLat && geocerca.centroLng) {
      const radio = geocerca.radioMetros || 100;
      const distancia = this.calcularDistanciaMetros(lat, lng, geocerca.centroLat, geocerca.centroLng);
      return distancia <= radio;
    }

    if (geocerca.tipo === 'Poligonal' && geocerca.poligonoJson) {
      const coords = Array.isArray(geocerca.poligonoJson)
        ? geocerca.poligonoJson
        : (typeof geocerca.poligonoJson === 'string' ? JSON.parse(geocerca.poligonoJson) : []);
      return this.puntoEnPoligono(lat, lng, coords);
    }

    return false;
  }
}

module.exports = new GeofenceService();
