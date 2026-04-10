import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { PublicController } from './modules/public/public.controller';
import { AppService } from './app.service';
import { databaseConfig } from './config/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { BillingModule } from './modules/billing/billing.module';
import { CustomerModule } from './modules/customer/customer.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot(databaseConfig()),
    AuthModule,
    WorkspaceModule,
    InventoryModule,
    TransactionsModule,
    BillingModule,
    CustomerModule,
  ],
  controllers: [AppController, PublicController],
  providers: [AppService],
})
export class AppModule {}
