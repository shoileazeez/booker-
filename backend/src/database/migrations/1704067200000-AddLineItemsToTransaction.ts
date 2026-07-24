import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddLineItemsToTransaction1704067200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transactions');
    const hasLineItems = table?.findColumnByName('lineItems');
    if (!hasLineItems) {
      await queryRunner.addColumn(
        'transactions',
        new TableColumn({
          name: 'lineItems',
          type: 'jsonb',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transactions');
    const hasLineItems = table?.findColumnByName('lineItems');
    if (hasLineItems) {
      await queryRunner.dropColumn('transactions', 'lineItems');
    }
  }
}
