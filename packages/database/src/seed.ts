import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create default organization
  const org = await prisma.organization.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      name: 'TakeControl Demo',
      slug: 'default',
      plan: 'enterprise',
      status: 'active',
      maxTechnicians: 100,
      maxConcurrentSessions: 50,
      requireSessionApproval: true,
      allowFileTransfer: true,
      allowChat: true,
      allowRecording: true,
    },
  });
  console.log('✅ Organization created:', org.name);

  const passwordHash = await bcrypt.hash('Admin@123456!', 12);

  // Super admin
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@takecontrol.app' },
    update: {},
    create: {
      email: 'admin@takecontrol.app',
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      displayName: 'Super Admin',
      role: 'super_admin',
      status: 'active',
      emailVerified: true,
      organizationId: org.id,
    },
  });
  console.log('✅ Super admin created:', superAdmin.email);

  // Org admin
  const orgAdmin = await prisma.user.upsert({
    where: { email: 'orgadmin@takecontrol.app' },
    update: {},
    create: {
      email: 'orgadmin@takecontrol.app',
      passwordHash,
      firstName: 'Org',
      lastName: 'Admin',
      displayName: 'Org Admin',
      role: 'org_admin',
      status: 'active',
      emailVerified: true,
      organizationId: org.id,
    },
  });
  console.log('✅ Org admin created:', orgAdmin.email);

  // Demo technician
  const technicianHash = await bcrypt.hash('Tech@123456!', 12);
  const technician = await prisma.user.upsert({
    where: { email: 'tech@takecontrol.app' },
    update: {},
    create: {
      email: 'tech@takecontrol.app',
      passwordHash: technicianHash,
      firstName: 'John',
      lastName: 'Technician',
      displayName: 'John Technician',
      role: 'technician',
      status: 'active',
      emailVerified: true,
      organizationId: org.id,
    },
  });
  console.log('✅ Technician created:', technician.email);

  // Demo user
  const userHash = await bcrypt.hash('User@123456!', 12);
  const demoUser = await prisma.user.upsert({
    where: { email: 'user@takecontrol.app' },
    update: {},
    create: {
      email: 'user@takecontrol.app',
      passwordHash: userHash,
      firstName: 'Jane',
      lastName: 'User',
      displayName: 'Jane User',
      role: 'user',
      status: 'active',
      emailVerified: true,
      organizationId: org.id,
    },
  });
  console.log('✅ Demo user created:', demoUser.email);

  // Demo device
  await prisma.device.upsert({
    where: { id: 'demo-device-001' },
    update: {},
    create: {
      id: 'demo-device-001',
      name: "Jane's Laptop",
      hostname: 'JANES-LAPTOP',
      os: 'windows',
      osVersion: 'Windows 11 Pro 22H2',
      agentVersion: '1.0.0',
      agentStatus: 'running',
      status: 'online',
      ipAddress: '192.168.1.100',
      cpuInfo: 'Intel Core i7-12700H',
      ramInfo: '16 GB',
      timezone: 'Europe/Tallinn',
      locale: 'et-EE',
      userId: demoUser.id,
      organizationId: org.id,
    },
  });
  console.log('✅ Demo device created');

  console.log('\n🎉 Seeding complete!');
  console.log('\n📋 Demo credentials:');
  console.log('  Super Admin: admin@takecontrol.app / Admin@123456!');
  console.log('  Org Admin:   orgadmin@takecontrol.app / Admin@123456!');
  console.log('  Technician:  tech@takecontrol.app / Tech@123456!');
  console.log('  User:        user@takecontrol.app / User@123456!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
