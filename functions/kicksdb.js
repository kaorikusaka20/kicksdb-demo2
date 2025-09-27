// functions/kicksdb.js
// Netlify Function para conectar con KicksDB API Pro
// Solo datos reales, sin fallbacks

console.log('🚀 [KICKSDB FUNCTION] Iniciando función');

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
            dataKeys: Object.keys(data || {})
        });

        // Log de la estructura completa de datos recibidos
        console.log('🔍 [RAW_DATA_STRUCTURE]', {
            dataKeys: Object.keys(data || {}),
            hasProduct: !!data.product,
            hasData: !!data.data,
            hasMeta: !!data.meta,
            hasSchema: !!data.$schema,
            fullStructure: JSON.stringify(data, null, 2).substring(0, 500)
        });

        // Intentar diferentes estructuras de respuesta de KicksDB
        let product = null;

        if (data.product) {
            // Estructura: { product: {...} }
            product = data.product;
            console.log('✅ [STRUCTURE] Usando data.product');
        } else if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
            // Estructura: { data: {...} }
            product = data.data;
            console.log('✅ [STRUCTURE] Usando data.data');
        } else if (data.data && Array.isArray(data.data) && data.data.length > 0) {
            // Estructura: { data: [{...}] }
            product = data.data[0];
            console.log('✅ [STRUCTURE] Usando data.data[0]');
        } else if (data.id && data.title) {
            // Estructura: datos directos en root
            product = data;
            console.log('✅ [STRUCTURE] Usando datos en root');
        }

        if (!product) {
            console.log('❌ [DATA_ERROR] No se pudo extraer el producto de la respuesta');
            console.log('🔍 [DEBUG_DATA]', JSON.stringify(data, null, 2));
            return {
                statusCode: 404,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'Product structure not recognized',
                    message: `No se pudo interpretar la estructura de datos para ID: ${id}`,
                    receivedData: Object.keys(data || {}),
                    debugData: data
                })
            };
        }
        console.log('✅ [PRODUCT_FOUND]', {
            productId: product.id,
            productTitle: product.title,
            hasVariants: !!product.variants,
            variantsCount: product.variants?.length || 0,
            productKeys: Object.keys(product || {})
        });

        // Normalizar datos del producto con flexibilidad
        const normalizedData = {
            id: product.id || id,
            title: product.title || product.name || 'Sin título',
            image: product.image || product.imageUrl || product.thumbnail || null,
            sku: product.sku || product.id || id,
            lastUpdated: new Date().toISOString(),
            regularPrice: product.min_price || product.minPrice || product.price || 0,
            variants: product.variants || product.sizes || [],
            rawData: {
                min_price: product.min_price,
                max_price: product.max_price,
                weekly_orders: product.weekly_orders,
                updated_at: product.updated_at,
                allFields: Object.keys(product)
            }
        };

        console.log('🔄 [NORMALIZATION]', {
            originalId: product.id,
            normalizedId: normalizedData.id,
            originalTitle: product.title,
            normalizedTitle: normalizedData.title,
            hasImage: !!normalizedData.image,
            regularPrice: normalizedData.regularPrice,
            variantsCount: normalizedData.variants.length
        });

        // Log detallado de variantes si existen
        if (normalizedData.variants && normalizedData.variants.length > 0) {
            const variantSample = normalizedData.variants.slice(0, 3);
            console.log('📋 [VARIANTS_SAMPLE]', variantSample.map(v => ({
                size: v.size,
                lowest_ask: v.lowest_ask,
                highest_bid: v.highest_bid,
                total_asks: v.total_asks,
                available: (v.lowest_ask > 0 && v.total_asks > 0) || v.available
            })));
        } else {
            console.log('⚠️ [NO_VARIANTS] Producto sin variantes de talla');
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
