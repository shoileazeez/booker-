import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3 } from 'aws-sdk';
import PDFDocument from 'pdfkit';
import { Transaction } from './entities/transaction.entity';

@Injectable()
export class ReceiptService {
  private s3: S3;
  private bucket: string;
  private region: string;
  private endpoint: string;

  constructor(private configService: ConfigService) {
    this.region = this.configService.get<string>('DO_SPACE_REGION') || '';
    this.bucket = this.configService.get<string>('DO_SPACE_BUCKET') || '';
    this.endpoint = this.configService.get<string>('DO_SPACE_ENDPOINT') || '';
    this.s3 = new S3({
      endpoint: this.endpoint,
      region: this.region,
      accessKeyId: this.configService.get<string>('DO_SPACE_KEY') || '',
      secretAccessKey: this.configService.get<string>('DO_SPACE_SECRET') || '',
      signatureVersion: 'v4',
    });
  }

  async generateAndUploadReceipt(transaction: Transaction): Promise<string> {
    const doc = new PDFDocument({ margin: 40 });
    const buffers: Buffer[] = [];
    doc.on('data', (data) => buffers.push(data));
    doc.on('end', async () => {});

    const workspaceName = transaction.workspace?.name || 'BizRecord Workspace';
    const workspaceLogo = transaction.workspace?.logo || null;
    const customerName = transaction.customerName || 'Walk-in customer';
    const customerEmail = transaction.customerEmail || '';
    const itemName = transaction.item?.name || 'General transaction';
    const itemSku = transaction.item?.sku || '-';
    const itemCategory = transaction.item?.category || '-';
    const itemLocation = transaction.item?.location || '-';
    const currentStock = Number(transaction.item?.quantity || 0);
    const branchName = transaction.branch?.name || 'Main workspace';
    const transactionLabel =
      transaction.type === 'debt' ? 'Debt Sale Receipt' : 'Sales Receipt';
    const amountLabel =
      transaction.type === 'debt' ? 'Amount Due' : 'Amount Paid';
    const discountAmount = Number(transaction.discountAmount || 0);
    const amountPrefix = 'NGN';
    const formatCurrency = (value: number) =>
      `${amountPrefix} ${Number(value || 0).toLocaleString()}`;
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - 80;

    doc.rect(0, 0, pageWidth, 110).fill('#0f172a');
    // Try to render a logo if one is available (best-effort)
    try {
      if (workspaceLogo) {
        // Attempt to fetch image buffer (node >=18 provides global fetch)
        const res = await fetch(workspaceLogo as string).catch(() => null);
        if (res && res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          doc.image(buf, 40, 30, { width: 60, height: 60 });
        } else {
          doc
            .fillColor('#ffffff')
            .fontSize(22)
            .text('BizRecord', 40, 32, { align: 'left' });
        }
      } else {
        doc
          .fillColor('#ffffff')
          .fontSize(22)
          .text('BizRecord', 40, 32, { align: 'left' });
      }
    } catch {
      doc
        .fillColor('#ffffff')
        .fontSize(22)
        .text('BizRecord', 40, 32, { align: 'left' });
    }

    doc
      .fontSize(10)
      .fillColor('#cbd5e1')
      .text('Workspace Transaction Record', 40, 62, { align: 'left' });
    doc
      .fontSize(16)
      .fillColor('#ffffff')
      .text(transactionLabel, 40, 32, { align: 'right', width: contentWidth });
    doc
      .fontSize(10)
      .fillColor('#cbd5e1')
      .text(`Issued: ${transaction.createdAt.toLocaleString()}`, 40, 62, {
        align: 'right',
        width: contentWidth,
      });

    doc.y = 130;

    doc
      .fillColor('#111827')
      .fontSize(14)
      .text(workspaceName, 40, doc.y)
      .moveDown(0.2);
    doc
      .fontSize(10)
      .fillColor('#6b7280')
      .text(`Receipt ID: ${transaction.id}`)
      .text(`Issued for workspace: ${workspaceName}`)
      .text(`Branch: ${branchName}`)
      .text(
        `Recorded by team member: ${transaction.createdBy?.name || 'Team member'}`,
      )
      .text(`Payment method: ${(transaction.paymentMethod || 'cash').toUpperCase()}`)
      .text(`Status: ${(transaction.status || 'pending').toUpperCase()}`);
    if (transaction.dueDate) {
      doc.text(`Due date: ${transaction.dueDate.toLocaleDateString()}`);
    }

    doc.moveDown(0.8);

    const sectionHeader = (label: string) => {
      const y = doc.y;
      doc
        .rect(40, y, contentWidth, 22)
        .fill('#f1f5f9');
      doc
        .fillColor('#0f172a')
        .fontSize(11)
        .text(label, 48, y + 6);
      doc.y = y + 28;
    };

    sectionHeader('CUSTOMER DETAILS');
    doc
      .fillColor('#374151')
      .fontSize(10)
      .text(`Customer Name: ${customerName}`, 48)
      .text(`Customer Email: ${customerEmail || '-'}`, 48)
      .text(`Phone Number: ${transaction.phone || '-'}`, 48)
      .moveDown(0.7);

    sectionHeader('TRANSACTION DETAILS');
    doc.fillColor('#374151').fontSize(10);
    // If this transaction has line items, render a table
    if (transaction.lineItems && Array.isArray(transaction.lineItems) && transaction.lineItems.length) {
      const headers = ['Item', 'Qty', 'Unit', 'Discount', 'Total'];
      const startX = 48;
      const colWidths = [contentWidth * 0.45, contentWidth * 0.12, contentWidth * 0.14, contentWidth * 0.14, contentWidth * 0.15];
      // header row
      let x = startX;
      headers.forEach((h, i) => {
        doc.fontSize(10).fillColor('#111827').text(h, x, doc.y);
        x += colWidths[i];
      });
      doc.moveDown(0.6);
      // rows
      transaction.lineItems.forEach((li: any) => {
        let x = startX;
        doc.fillColor('#374151').fontSize(10).text(li.name || li.itemId, x, doc.y, { width: colWidths[0] });
        x += colWidths[0];
        doc.text(String(li.quantity), x, doc.y, { width: colWidths[1] });
        x += colWidths[1];
        doc.text(formatCurrency(Number(li.unitPrice || 0)), x, doc.y, { width: colWidths[2] });
        x += colWidths[2];
        doc.text(formatCurrency(Number(li.discountAmount || 0)), x, doc.y, { width: colWidths[3] });
        x += colWidths[3];
        doc.text(formatCurrency(Number(li.total || 0)), x, doc.y, { width: colWidths[4] });
        doc.moveDown(0.6);
      });
    } else {
      doc
        .text(`Item: ${itemName}`, 48)
        .text(`SKU: ${itemSku}`, 48)
        .text(`Category: ${itemCategory}`, 48)
        .text(`Location: ${itemLocation}`, 48)
        .text(`Quantity: ${Number(transaction.quantity || 0)}`, 48)
        .text(`Unit Price: ${formatCurrency(Number(transaction.unitPrice || 0))}`, 48)
        .text(`Remaining Stock: ${currentStock}`, 48)
        .moveDown(0.7);
    }

    const totalsY = doc.y;
    doc.rect(40, totalsY, contentWidth, 62).fill('#eff6ff');
    doc
      .fillColor('#1e3a8a')
      .fontSize(11)
      .text('PAYMENT SUMMARY', 48, totalsY + 10)
      .fillColor('#334155')
      .fontSize(10)
      .text(
        `Gross Amount: ${formatCurrency(
          Number(transaction.totalAmount || 0) + discountAmount,
        )}`,
        48,
        totalsY + 28,
      )
      .text(`Discount: ${formatCurrency(discountAmount)}`, 48, totalsY + 42)
      .fillColor('#111827')
      .fontSize(12)
      .text(
        `${amountLabel}: ${formatCurrency(Number(transaction.totalAmount || 0))}`,
        320,
        totalsY + 34,
      );
    doc.y = totalsY + 74;

    if (transaction.notes) {
      sectionHeader('NOTES');
      doc.fillColor('#374151').fontSize(10).text(transaction.notes, 48);
      doc.moveDown(0.5);
    }

    doc
      .moveDown(1)
      .strokeColor('#e5e7eb')
      .lineWidth(1)
      .moveTo(40, doc.y)
      .lineTo(pageWidth - 40, doc.y)
      .stroke();

    doc
      .fillColor('#0f172a')
      .fontSize(10)
      .text('This receipt was issued by the workspace provider listed above.', 40, doc.y + 10, {
        align: 'center',
        width: contentWidth,
      })
      .fillColor('#6b7280')
      .fontSize(9)
      .text('Generated securely by BizRecord', 40, doc.y + 26, {
        align: 'center',
        width: contentWidth,
      });
    doc.end();

    await new Promise((resolve) => doc.on('end', resolve));
    const pdfBuffer = Buffer.concat(buffers);

    const key = `receipts/${transaction.id}.pdf`;
    await this.s3
      .putObject({
        Bucket: this.bucket,
        Key: key,
        Body: pdfBuffer,
        ACL: 'public-read',
        ContentType: 'application/pdf',
      })
      .promise();

    return `https://${this.bucket}.${this.endpoint.replace('https://', '')}/${key}`;
  }
}
