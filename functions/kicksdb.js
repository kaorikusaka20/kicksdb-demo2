// functions/kicksdb.js
// Netlify Function para conectar con KicksDB API Pro - ESTRUCTURA CORREGIDA

console.log('🚀 [KICKSDB FUNCTION] Iniciando función - ESTRUCTURA CORREGIDA');

export const handler = async (event, context) => {
    // Log inicial con todos los detalles del evento
    console.log('📋 [EVENT DETAILS]', {
        httpMethod: event.httpMethod,
        queryStringParameters: event.queryStringParameters,
        headers: event.headers ? Object.keys(event.headers) : 'none',
        body: event.body ? 'present' : 'none',
        path: event.path,
        isBase64Encoded: event.isBase64Encoded
    });

    // Manejar CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        console.log('⚠️ [CORS] Manejando solicitud preflight');
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Max-Age': '86400',
            },
            body: JSON.stringify({ message: 'CORS preflight OK' })
        };
    }

    // Solo permitir GET
    if (event.httpMethod !== 'GET') {
        console.log('❌ [ERROR] Método no permitido:', event.httpMethod);
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                error: 'Method not allowed',
                allowedMethods: ['GET'],
                receivedMethod: event.httpMethod
            })
        };
    }

    // Extraer parámetros
    const { id, market = 'US' } = event.queryStringParameters || {};
    
    console.log('📊 [PARAMS]', { 
        id: id || 'NOT_PROVIDED', 
        market: market,
        allParams: event.queryStringParameters
    });

    // Validar que se proporcione ID
    if (!id) {
        console.log('❌ [VALIDATION] ID no proporcionado');
        return {
            statusCode: 400,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                error: 'ID parameter is required',
                message: 'Debes proporcionar un ID de producto',
                example: '?id=f1938d29-48da-47eb-a5f8-619a2d8443ca'
            })
        };
    }

    // Verificar API Key
    const apiKey = process.env.KICKSDB_API_KEY;
    
    console.log('🔐 [API_KEY]', {
        hasApiKey: !!apiKey,
        keyLength: apiKey ? apiKey.length : 0,
        keyStart: apiKey ? `${apiKey.substring(0, 8)}...` : 'NONE',
        envVarExists: 'KICKSDB_API_KEY' in process.env
    });

    if (!apiKey) {
        console.log('❌ [FATAL] API Key no encontrada en variables de entorno');
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                error: 'API Key not configured',
                message: 'La API Key de KicksDB no está configurada en el servidor'
            })
        };
    }

    try {
        // Construir URL de la API
        const apiUrl = `https://api.kicks.dev/v3/stockx/products/${encodeURIComponent(id)}`;
        
        console.log('🌐 [API_REQUEST]', {
            url: apiUrl,
            method: 'GET',
            id: id,
            market: market
        });

        // Headers para la petición
        const requestHeaders = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'KicksDB-Simple-App/1.0',
            'Accept': 'application/json'
        };

        console.log('📤 [REQUEST_HEADERS]', {
            hasAuth: !!requestHeaders.Authorization,
            contentType: requestHeaders['Content-Type'],
            userAgent: requestHeaders['User-Agent']
        });

        // Hacer petición a KicksDB
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: requestHeaders
        });

        console.log('📡 [API_RESPONSE]', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            contentType: response.headers.get('content-type'),
            contentLength: response.headers.get('content-length')
        });

        // Si la respuesta no es exitosa
        if (!response.ok) {
            const errorText = await response.text().catch(() => 'No error details');
            console.log('❌ [API_ERROR]', {
                status: response.status,
                statusText: response.statusText,
                errorBody: errorText.substring(0, 500)
            });

            return {
                statusCode: response.status,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'KicksDB API Error',
                    status: response.status,
                    message: `La API de KicksDB respondió con error: ${response.status} ${response.statusText}`,
                    details: errorText.substring(0, 200)
                })
            };
        }

        // Parsear respuesta JSON
        const data = await response.json();
        
        console.log('✅ [JSON_PARSED]', {
            hasProduct: !!data.product,
            productId: data.product?.id,
            productTitle: data.product?.title,
            hasVariants: !!data.product?.variants,
            variantsCount: data.product?.variants?.length || 0,
            hasPrices: !!data.product?.prices,
            pricesKeys: data.product?.prices ? Object.keys(data.product.prices) : [],
            dataKeys: Object.keys(data || {})
        });

        // Validar estructura de respuesta
        if (!data.product) {
            console.log('❌ [DATA_ERROR] No se encontró el producto en la respuesta');
            return {
                statusCode: 404,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'Product not found',
                    message: `No se encontró un producto con ID: ${id}`,
                    receivedData: Object.keys(data || {})
                })
            };
        }

        // --- CORRECCIÓN CRÍTICA: TRANSFORMAR ESTRUCTURA DE PRECIOS A VARIANTES ---
        const product = data.product;
        let variants = [];

        console.log('🔄 [TRANSFORM_START] Transformando estructura de datos');

        // 1. Primero intentar usar la estructura legacy (variants) si existe
        if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
            console.log('✅ [LEGACY_STRUCTURE] Usando estructura legacy de variants');
            variants = product.variants;
        }
        // 2. Si no hay variants, usar la nueva estructura de prices
        else if (product.prices && typeof product.prices === 'object') {
            console.log('💰 [NEW_STRUCTURE] Transformando estructura de prices a variants');
            
            const currencyKeys = Object.keys(product.prices);
            console.log('🌍 [CURRENCIES] Monedas disponibles:', currencyKeys);
            
            if (currencyKeys.length > 0) {
                // Usar la primera moneda disponible (ej: 'USD_US')
                const primaryCurrency = currencyKeys[0];
                const priceMap = product.prices[primaryCurrency];
                
                console.log('🔢 [PRICE_MAP] Mapa de precios:', {
                    currency: primaryCurrency,
                    sizesCount: priceMap ? Object.keys(priceMap).length : 0,
                    sampleSizes: priceMap ? Object.keys(priceMap).slice(0, 5) : []
                });

                if (priceMap && typeof priceMap === 'object') {
                    // Convertir objeto de precios a array de variantes
                    variants = Object.entries(priceMap).map(([size, price]) => {
                        return {
                            size: size,
                            lowest_ask: price,
                            // Si el precio es mayor a 0, hay stock disponible
                            total_asks: price > 0 ? 1 : 0,
                            _source: 'prices_transformation',
                            _currency: primaryCurrency
                        };
                    });
                    
                    console.log(`✅ [TRANSFORM_SUCCESS] Convertidas ${variants.length} tallas desde prices`);
                } else {
                    console.log('❌ [PRICE_MAP_ERROR] priceMap no es un objeto válido');
                    variants = [];
                }
            } else {
                console.log('❌ [NO_CURRENCIES] No se encontraron monedas en prices');
                variants = [];
            }
        } else {
            console.log('❌ [NO_STRUCTURE] No se encontró estructura de variants ni prices');
            variants = [];
        }

        console.log('📊 [VARIANTS_FINAL]', {
            totalVariants: variants.length,
            sample: variants.slice(0, 3).map(v => ({ size: v.size, price: v.lowest_ask }))
        });

        // Normalizar datos del producto
        const normalizedData = {
            id: product.id,
            title: product.title || 'Sin título',
            image: product.image || null,
            sku: product.sku || product.id,
            lastUpdated: new Date().toISOString(),
            regularPrice: product.min_price || 0,
            variants: variants, // USAMOS LAS VARIANTES TRANSFORMADAS
            rawData: {
                min_price: product.min_price,
                max_price: product.max_price,
                weekly_orders: product.weekly_orders,
                updated_at: product.updated_at,
                transformation: variants.length > 0 ? variants[0]._source : 'none'
            },
            debug: {
                transformationSource: variants.length > 0 ? variants[0]._source : 'none',
                originalHasVariants: !!product.variants,
                originalHasPrices: !!product.prices,
                variantsCount: variants.length,
                timestamp: new Date().toISOString()
            }
        };

        console.log('🔄 [NORMALIZATION_COMPLETE]', {
            originalVariants: product.variants?.length || 0,
            transformedVariants: normalizedData.variants.length,
            normalizedId: normalizedData.id,
            normalizedTitle: normalizedData.title,
            hasImage: !!normalizedData.image,
            regularPrice: normalizedData.regularPrice
        });

        // Log detallado de variantes
        if (normalizedData.variants.length > 0) {
            const variantSample = normalizedData.variants.slice(0, 5);
            console.log('📋 [VARIANTS_SAMPLE]', variantSample.map(v => ({
                size: v.size,
                lowest_ask: v.lowest_ask,
                total_asks: v.total_asks,
                available: v.lowest_ask > 0 && v.total_asks > 0,
                source: v._source || 'legacy'
            })));
        } else {
            console.log('❌ [NO_VARIANTS] No se pudieron obtener variantes del producto');
        }

        // Respuesta exitosa
        console.log('✅ [SUCCESS] Datos normalizados listos para enviar');
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=60'
            },
            body: JSON.stringify(normalizedData)
        };

    } catch (error) {
        // Log detallado del error
        console.error('💥 [FATAL_ERROR]', {
            name: error.name,
            message: error.message,
            stack: error.stack?.substring(0, 1000),
            cause: error.cause
        });

        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: 'Error interno del servidor al procesar la solicitud',
                details: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};
