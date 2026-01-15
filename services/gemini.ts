
import { GoogleGenAI } from "@google/genai";
import { CatalogProduct } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function identifyProduct(
  base64Image: string, 
  catalog: CatalogProduct[]
): Promise<{ name: string; price: number; isFromBarcode: boolean }> {
  try {
    const catalogInfo = catalog.map(p => `- Code ${p.barcode}: ${p.name} (€${p.price})`).join("\n");
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image,
            },
          },
          {
            text: `Je bent de computer van een supermarkt kassa voor kleuters.
            
PRIJSLIJST VAN DEZE WINKEL:
${catalogInfo}

INSTRUCTIE:
1. Kijk heel goed of je een barcode ziet op de foto.
2. Als je een barcode ziet, zoek het nummer op in de prijslijst.
3. Als je GEEN barcode ziet, kijk dan welk speelgoed-eten dit is. Zoek de beste match in de prijslijst.
4. Als het product helemaal niet in de lijst staat, verzin dan een korte naam en geef het een prijs van 1 of 2 euro.

ANTWOORD UITSLUITEND IN DIT JSON FORMAAT:
{"name": "Productnaam", "price": 1, "isFromBarcode": true/false}`
          }
        ],
      },
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text || '{"name": "Iets lekkers", "price": 1, "isFromBarcode": false}';
    const result = JSON.parse(text);
    
    return {
      name: result.name || "Product",
      price: result.price === 2 ? 2 : 1,
      isFromBarcode: !!result.isFromBarcode
    };
  } catch (error) {
    console.error("Gemini identifying error:", error);
    return { name: "Iets lekkers", price: 1, isFromBarcode: false };
  }
}
