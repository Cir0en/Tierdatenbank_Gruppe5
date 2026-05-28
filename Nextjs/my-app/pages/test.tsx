'use client';

import { useState } from 'react';

type CollectItem = {
  id?: number;
  collectionId?: number;
  taxonomyId?: number;
  name?: string;
  findDate?: string;
  description?: string;
  storageInfo?: string;
  findingLocationId?: number;
  storageLocationId?: number;
};

export default function AnimalTest() {
  const [animals, setAnimals] = useState<CollectItem[]>([]);
  const [newAnimal, setNewAnimal] = useState<CollectItem>({
    name: 'Test Animal',
    description: 'A test animal specimen',
    findDate: '2024-01-15',
  });

  // Fetch all animals
  const fetchAnimals = async () => {
    const response = await fetch('http://localhost:5099/api/animals');
    const data = await response.json();
    setAnimals(data);
  };

  // Create new animal
  const createAnimal = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const response = await fetch('http://localhost:5099/api/animals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAnimal)
    });

    if (response.ok) {
      const created = await response.json();
      console.log('Created animal:', created);
      fetchAnimals(); // Refresh list
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl mb-4">Animal API Test</h1>
      
      <form onSubmit={createAnimal} className="mb-4 space-y-2">
        <input
          type="text"
          placeholder="Name"
          value={newAnimal.name || ''}
          onChange={(e) => setNewAnimal({...newAnimal, name: e.target.value})}
          className="border p-2 w-full"
        />
        <input
          type="text"
          placeholder="Description"
          value={newAnimal.description || ''}
          onChange={(e) => setNewAnimal({...newAnimal, description: e.target.value})}
          className="border p-2 w-full"
        />
        <button type="submit" className="bg-blue-500 text-white p-2 rounded">
          Create Animal
        </button>
      </form>

      <button onClick={fetchAnimals} className="bg-green-500 text-white p-2 rounded mb-4">
        Fetch Animals
      </button>

      <ul className="space-y-2">
        {animals.map((animal) => (
          <li key={animal.id} className="border p-2">
            <strong>{animal.name}</strong> - {animal.description}
          </li>
        ))}
      </ul>
    </div>
  );
}