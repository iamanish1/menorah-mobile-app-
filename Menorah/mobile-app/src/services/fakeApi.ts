import { mockCounsellors } from '@/mock/counsellors';

// Simulate API delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const api = {
  async listCounsellors(
    query: string = '',
    categories: string[] = [],
    languages: string[] = []
  ) {
    await delay(300); // Simulate network delay
    
    let filtered = [...mockCounsellors];
    
    // Filter by search query
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(q) ||
        c.specialization.toLowerCase().includes(q) ||
        c.specializations?.some(s => s.toLowerCase().includes(q))
      );
    }
    
    // Filter by categories
    if (categories.length > 0) {
      filtered = filtered.filter(c =>
        categories.some(cat => 
          c.specializations?.some(s => s.toLowerCase().includes(cat.toLowerCase()))
        )
      );
    }
    
    // Filter by languages
    if (languages.length > 0) {
      filtered = filtered.filter(c =>
        languages.some(lang => 
          c.languages.some(l => l.toLowerCase().includes(lang.toLowerCase()))
        )
      );
    }
    
    return filtered;
  },

  async availability(counsellorId: string) {
    await delay(200);
    
    // Generate random availability slots for the next 7 days
    const slots = [];
    const now = new Date();
    
    for (let day = 0; day < 7; day++) {
      const date = new Date(now);
      date.setDate(date.getDate() + day);
      
      // Generate 3-6 slots per day
      const numSlots = Math.floor(Math.random() * 4) + 3;
      for (let i = 0; i < numSlots; i++) {
        const slot = new Date(date);
        slot.setHours(9 + Math.floor(Math.random() * 8), 0, 0, 0); // 9 AM to 5 PM
        slots.push(slot.toISOString());
      }
    }
    
    return slots.sort();
  }
};
