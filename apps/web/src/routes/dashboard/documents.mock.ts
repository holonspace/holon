import { type Payment } from '@/components/document'

export const mockPayments: Payment[] = [
  {
    id: "728ed52f",
    amount: 100,
    status: "pending",
    email: "m@example.com",
  },
  {
    id: "489e1d42",
    amount: 250,
    status: "processing",
    email: "john.doe@example.com",
  },
  {
    id: "a1b2c3d4",
    amount: 500,
    status: "success",
    email: "jane.smith@example.com",
  },
  {
    id: "e5f6a7b8",
    amount: 75,
    status: "failed",
    email: "alice@example.com",
  },
  {
    id: "c9d0e1f2",
    amount: 320,
    status: "success",
    email: "bob.johnson@example.com",
  },
  {
    id: "f3a4b5c6",
    amount: 150,
    status: "pending",
    email: "carol@example.com",
  },
  {
    id: "d7e8f9a0",
    amount: 890,
    status: "processing",
    email: "david.lee@example.com",
  },
  {
    id: "b1c2d3e4",
    amount: 45,
    status: "success",
    email: "eve.wilson@example.com",
  },
]
