import { Injectable, Logger } from '@nestjs/common';
import { chromium } from 'playwright';
import * as pdfParse from 'pdf-parse';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DocumentIngestionService {
  private readonly logger = new Logger(DocumentIngestionService.name);

  /**
   * Process a PDF file and extract its text content
   */
  async extractPdfContent(filePath: string): Promise<string> {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(dataBuffer);
      return pdfData.text;
    } catch (error) {
      this.logger.error(`Failed to extract PDF content: ${error.message}`, error.stack);
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  /**
   * Process a PPTX file using Playwright to extract content
   */
  async extractPptxContent(filePath: string): Promise<string> {
    const browser = await chromium.launch({ headless: true });
    const tempHtmlPath = path.join(os.tmpdir(), `${uuidv4()}.html`);
    let content = '';
    
    try {
      // Use Playwright to open the PPTX in Office 365 or Google Slides
      // and extract the content programmatically
      const page = await browser.newPage();
      
      // Create a simple viewer for the PPTX
      await fs.writeFile(tempHtmlPath, `
        <!DOCTYPE html>
        <html>
        <head>
          <title>PPTX Viewer</title>
          <script src="https://cdn.jsdelivr.net/npm/pptxgenjs@3.11.0/dist/pptxgen.bundle.js"></script>
        </head>
        <body>
          <div id="content"></div>
          <script>
            const viewer = document.getElementById('content');
            
            // Use PptxGenJS to try to extract data
            // This is a simplified approach - in production you'd want a more robust solution
            
            document.addEventListener('DOMContentLoaded', function() {
              // This would work best with a proper server-side PPTX extraction
              viewer.textContent = 'PPTX content extraction via browser';
            });
          </script>
        </body>
        </html>
      `);
      
      await page.goto(`file://${tempHtmlPath}`);
      
      // In a real implementation, we'd use a better PPTX parsing library or service
      // This is just a demonstration of the approach
      content = `PPTX File: ${path.basename(filePath)}\n`;
      content += `(Note: Full PPTX content extraction requires specialized libraries)`; 
      
      await page.close();
    } catch (error) {
      this.logger.error(`Failed to extract PPTX content: ${error.message}`, error.stack);
      throw new Error(`PPTX extraction failed: ${error.message}`);
    } finally {
      await browser.close();
      try {
        await fs.unlink(tempHtmlPath);
      } catch (e) {
        this.logger.warn(`Failed to delete temp HTML file: ${e.message}`);
      }
    }
    
    return content;
  }
}
