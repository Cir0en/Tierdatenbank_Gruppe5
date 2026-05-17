"use client";
import { useEffect, useState } from "react";

export default function Test() {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch("/api/objects")
      .then(res => res.json())
      .then(setData);
  }, []);

  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}