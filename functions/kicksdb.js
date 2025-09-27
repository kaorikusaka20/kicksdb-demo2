// functions/kicksdb.js
// Función compatible con Node.js en Netlify (CommonJS)

const handler = async (event, context) => {
    console.log('🚀 [KICKSDB START] Función iniciada');
    console.log('📝 [REQUEST] ID solicitado:', event.queryStringParameters?.id);
    
    // Manejar CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            },
            body: JSON.stringify({ message: 'CORS OK' })
        };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    const { id } = event.queryStringParameters || {};
    console.log(`🔍 [PARAMS] ID recibido: "${id}"`);

    if (!id) {
        return {
            statusCode: 400,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'ID parameter is required' })
        };
    }

    const apiKey = process.env.KICKSDB_API_KEY;
    console.log('🔑 [API_KEY] Disponible:', !!apiKey);

    if (!apiKey) {
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'API Key not configured' })
        };
    }

    try {
        const apiUrl = `https://api.kicks.dev/v3/stockx/products/${encodeURIComponent(id)}`;
        console.log(`🌐 [API_CALL] URL: ${apiUrl}`);

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'User-Agent': 'KicksDB-App/1.0'
            }
        });

        console.log(`📡 [RESPONSE] Status: ${response.status}`);

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'No error details');
            console.log(`❌ [API_ERROR] ${response.status}: ${errorText.substring(0, 200)}`);
            return {
                statusCode: response.status,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'KicksDB API Error',
                    status: response.status,
                    details: errorText.substring(0, 200)
                })
            };
        }

        // Parsear respuesta
        const rawData = await response.json();
        console.log(`✅ [RAW_JSON] Parseado exitosamente`);
        console.log(`🔍 [RAW_KEYS] ${Object.keys(rawData).join(', ')}`);

                // Extraer producto
        const product = rawData.product;
        if (!product) {
            console.log(`❌ [NO_PRODUCT] No se encontró 'product' en la respuesta`);
            console.log(`📋 [AVAILABLE_KEYS] ${Object.keys(rawData).join(', ')}`);
            return {
                statusCode: 404,
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Product not found in response',
                    receivedKeys: Object.keys(rawData),
                    rawData: JSON.stringify(rawData).substring(0, 500)
                })
            };
        }

        console.log(`✅ [PRODUCT] ID: ${product.id}, Title: ${product.title}`);
        
        // --- INICIO DE LA TRANSFORMACIÓN DE VARIANTES ---
        let rawVariants = [];

        // Intentar obtener variantes de la antigua estructura (product.variants)
        if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
            rawVariants = product.variants;
            console.log(`✅ [VARIANTS_LEGACY] Usando variantes de la estructura legacy. Total: ${rawVariants.length}`);
        } 
        // Si no hay variantes en la estructura legacy, intentar con la nueva estructura (product.prices)
        else if (product.prices && typeof product.prices === 'object') {
            console.log(`🔍 [PRICES_STRUCTURE] Intentando obtener variantes de prices. Claves de moneda:`, Object.keys(product.prices));

            // Tomar la primera moneda disponible (ej: 'USD_US')
            const currencyKeys = Object.keys(product.prices);
            if (currencyKeys.length > 0) {
                const primaryCurrency = currencyKeys[0];
                const priceMap = product.prices[primaryCurrency];
                console.log(`🔢 [PRICE_MAP] Mapa de precios para ${primaryCurrency}:`, priceMap);

                // Convertir el objeto de precios en un array de variantes.
                // El objeto priceMap tiene la forma: { "9.5": 150, "10": 175 }
                rawVariants = Object.keys(priceMap).map(size => {
                    const lowest_ask = priceMap[size];
                    return {
                        size: size,
                        lowest_ask: lowest_ask,
                        // Si el precio es 0, no hay stock disponible.
                        total_asks: lowest_ask > 0 ? 1 : 0
                    };
                });
                console.log(`🔄 [VARIANTS_CREATED] Se crearon ${rawVariants.length} variantes desde prices.`);
            } else {
                console.log(`❌ [NO_CURRENCY_KEYS] No se encontraron claves de moneda en prices.`);
            }
        } else {
            console.log(`❌ [NO_VARIANTS] No se encontraron variantes en ninguna estructura.`);
        }

        console.log(`📊 [VARIANTS_FINAL] Total de variantes: ${rawVariants.length}`);
        // --- FIN DE LA TRANSFORMACIÓN DE VARIANTES ---

        // Log de las primeras 3 variantes
        if (rawVariants.length > 0) {
            const sampleVariants = rawVariants.slice(0, 3);
            sampleVariants.forEach((variant, index) => {
                console.log(`🔍 [VARIANT_${index + 1}] Size: ${variant.size}, Ask: $${variant.lowest_ask}, Total: ${variant.total_asks}, Available: ${variant.lowest_ask > 0 && variant.total_asks > 0}`);
            });

            // Log resumido de TODAS las variantes
            const variantsSummary = rawVariants.map(v => `${v.size}:$${v.lowest_ask}(${v.total_asks})`).join(', ');
            console.log(`📋 [ALL_VARIANTS] ${variantsSummary}`);
        } else {
            console.log(`❌ [NO_VARIANTS] Sin variantes válidas`);
        }

        // Crear respuesta normalizada
        const responseData = {
            id: product.id,
            title: product.title,
            image: product.image,
            sku: product.sku,
            lastUpdated: new Date().toISOString(),
            regularPrice: product.min_price || 0,
            variants: rawVariants, // Usamos las variantes transformadas
            debug: {
                requestedId: id,
                returnedId: product.id,
                originalVariantsCount: rawVariants.length,
                timestampProcessed: new Date().toISOString(),
                apiUrl: apiUrl,
                // Incluimos información sobre la estructura de precios por si acaso
                pricesCurrencyKeys: product.prices ? Object.keys(product.prices) : [],
                usedLegacyVariants: !!(product.variants && Array.isArray(product.variants) && product.variants.length > 0)
            }
        };

        console.log(`✅ [RESPONSE_READY] Final variants: ${responseData.variants.length}`);
        console.log(`📤 [SENDING] ID: ${responseData.id}, Title: ${responseData.title}, Variants: ${responseData.variants.length}`);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate', // SIN CACHÉ
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            body: JSON.stringify(responseData)
        };
        // Crear respuesta normalizada - PRESERVAR VARIANTES EXACTAS
        const responseData = {
            id: product.id,
            title: product.title,
            image: product.image,
            sku: product.sku,
            lastUpdated: new Date().toISOString(),
            regularPrice: product.min_price || 0,
            variants: rawVariants || [], // PASAR VARIANTES SIN MODIFICAR
            debug: {
                requestedId: id,
                returnedId: product.id,
                originalVariantsCount: rawVariants ? rawVariants.length : 0,
                timestampProcessed: new Date().toISOString(),
                apiUrl: apiUrl
            }
        };

        console.log(`✅ [RESPONSE_READY] Final variants: ${responseData.variants.length}`);
        console.log(`📤 [SENDING] ID: ${responseData.id}, Title: ${responseData.title}, Variants: ${responseData.variants.length}`);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate', // SIN CACHÉ
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            body: JSON.stringify(responseData)
        };

    } catch (error) {
        console.error(`💥 [FATAL_ERROR] ${error.message}`);
        console.error(`📚 [STACK] ${error.stack}`);
        
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};

module.exports = { handler };
