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
        
        // Verificar variantes ANTES de procesar
        const rawVariants = product.variants;
        console.log(`📊 [VARIANTS_RAW] Exists: ${!!rawVariants}, Type: ${typeof rawVariants}, IsArray: ${Array.isArray(rawVariants)}, Length: ${rawVariants ? rawVariants.length : 0}`);

        if (rawVariants && Array.isArray(rawVariants) && rawVariants.length > 0) {
            console.log(`✅ [VARIANTS_FOUND] Total: ${rawVariants.length}`);
            
            // Log de las primeras 3 variantes
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
