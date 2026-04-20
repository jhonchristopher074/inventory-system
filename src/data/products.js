import { reactive } from 'vue'

export const products = reactive([
  {
    id: 1,
    name: 'Product 1',
    category: 'Electronics',
    qty: 25,
    img: 'https://via.placeholder.com/300x200',
    inspectionDate: '2026-04-24',
    inspected: false,
    inspectionResult: '',
  },
  {
    id: 2,
    name: 'Product 2',
    category: 'Furniture',
    qty: 18,
    img: 'https://via.placeholder.com/300x200',
    inspectionDate: '2026-04-24',
    inspected: false,
    inspectionResult: '',
  },
  {
    id: 3,
    name: 'Product 3',
    category: 'Office Supplies',
    qty: 10,
    img: 'https://via.placeholder.com/300x200',
    inspectionDate: '2026-05-02',
    inspected: false,
    inspectionResult: '',
  },
  {
    id: 4,
    name: 'Product 4',
    category: 'Appliances',
    qty: 40,
    img: 'https://via.placeholder.com/300x200',
    inspectionDate: null,
    inspected: false,
    inspectionResult: '',
  },
])