import { describe, it, expect } from 'vitest';
import { createCodeParser } from '../code-indexing/code-parser';

describe('Code Parser', () => {
  const parser = createCodeParser();

  describe('parseSource', () => {
    it('should extract exported function declarations', () => {
      const source = `
export function authenticate(token: string): boolean {
  return token.length > 0;
}
`;
      const result = parser.parseSource(source, 'src/auth.ts');
      const func = result.symbols.find((s) => s.name === 'authenticate');

      expect(func).toBeDefined();
      expect(func!.kind).toBe('function');
      expect(func!.isExported).toBe(true);
      expect(func!.filePath).toBe('src/auth.ts');
    });

    it('should extract async function declarations', () => {
      const source = `
export async function fetchUser(id: string): Promise<User> {
  const data = await db.query(id);
  return data;
}
`;
      const result = parser.parseSource(source, 'src/user.ts');
      const func = result.symbols.find((s) => s.name === 'fetchUser');

      expect(func).toBeDefined();
      expect(func!.kind).toBe('function');
      expect(func!.isExported).toBe(true);
    });

    it('should extract non-exported functions', () => {
      const source = `
function helperFn(x: number): number {
  return x * 2;
}
`;
      const result = parser.parseSource(source, 'src/utils.ts');
      const func = result.symbols.find((s) => s.name === 'helperFn');

      expect(func).toBeDefined();
      expect(func!.isExported).toBe(false);
    });

    it('should extract class declarations', () => {
      const source = `
export class UserService {
  async getUser(id: string) {
    return null;
  }

  async deleteUser(id: string) {
    return true;
  }
}
`;
      const result = parser.parseSource(source, 'src/service.ts');
      const cls = result.symbols.find((s) => s.name === 'UserService');

      expect(cls).toBeDefined();
      expect(cls!.kind).toBe('class');
      expect(cls!.isExported).toBe(true);
    });

    it('should extract interface declarations', () => {
      const source = `
export interface UserConfig {
  name: string;
  email: string;
  role: 'admin' | 'user';
}
`;
      const result = parser.parseSource(source, 'src/types.ts');
      const iface = result.symbols.find((s) => s.name === 'UserConfig');

      expect(iface).toBeDefined();
      expect(iface!.kind).toBe('interface');
      expect(iface!.isExported).toBe(true);
    });

    it('should extract type alias declarations', () => {
      const source = `
export type UserId = string;
`;
      const result = parser.parseSource(source, 'src/types.ts');
      const typeAlias = result.symbols.find((s) => s.name === 'UserId');

      expect(typeAlias).toBeDefined();
      expect(typeAlias!.kind).toBe('type');
      expect(typeAlias!.isExported).toBe(true);
    });

    it('should extract import statements', () => {
      const source = `
import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
`;
      const result = parser.parseSource(source, 'src/app.tsx');

      expect(result.imports).toContain('react');
      expect(result.imports).toContain('@supabase/supabase-js');
    });

    it('should extract JSDoc comments', () => {
      const source = `
/**
 * Validates user credentials
 * @param username The username to validate
 * @returns true if valid
 */
export function validateUser(username: string): boolean {
  return username.length > 3;
}
`;
      const result = parser.parseSource(source, 'src/auth.ts');
      const func = result.symbols.find((s) => s.name === 'validateUser');

      expect(func).toBeDefined();
      expect(func!.docComment).toBeDefined();
      expect(func!.docComment).toContain('Validates user credentials');
    });

    it('should detect language from file extension', () => {
      expect(parser.parseSource('', 'src/app.ts').language).toBe('typescript');
      expect(parser.parseSource('', 'src/app.tsx').language).toBe('tsx');
      expect(parser.parseSource('', 'src/app.js').language).toBe('javascript');
      expect(parser.parseSource('', 'src/app.jsx').language).toBe('jsx');
      expect(parser.parseSource('', 'src/app.py').language).toBe('python');
      expect(parser.parseSource('', 'src/app.go').language).toBe('go');
      expect(parser.parseSource('', 'src/App.java').language).toBe('java');
      expect(parser.parseSource('', 'src/main.rs').language).toBe('rust');
      expect(parser.parseSource('', 'src/app.rb').language).toBe('ruby');
      expect(parser.parseSource('', 'src/App.kt').language).toBe('kotlin');
      expect(parser.parseSource('', 'src/App.swift').language).toBe('swift');
      expect(parser.parseSource('', 'src/App.cs').language).toBe('csharp');
      expect(parser.parseSource('', 'src/main.cpp').language).toBe('cpp');
      expect(parser.parseSource('', 'src/main.c').language).toBe('c');
      expect(parser.parseSource('', 'src/index.php').language).toBe('php');
      expect(parser.parseSource('', 'src/data.txt').language).toBe('unknown');
    });

    it('should generate content hash', () => {
      const result1 = parser.parseSource('const a = 1;', 'src/a.ts');
      const result2 = parser.parseSource('const b = 2;', 'src/b.ts');
      const result3 = parser.parseSource('const a = 1;', 'src/c.ts');

      expect(result1.contentHash).not.toBe(result2.contentHash);
      expect(result1.contentHash).toBe(result3.contentHash);
    });

    it('should extract exported const variables', () => {
      const source = `
export const MAX_RETRIES = 3;
export const API_URL = 'https://api.example.com';
`;
      const result = parser.parseSource(source, 'src/config.ts');
      const maxRetries = result.symbols.find((s) => s.name === 'MAX_RETRIES');

      expect(maxRetries).toBeDefined();
      expect(maxRetries!.kind).toBe('variable');
      expect(maxRetries!.isExported).toBe(true);
    });

    it('should extract re-exports', () => {
      const source = `
export { createUser, deleteUser } from './user';
export type { UserConfig } from './types';
`;
      const result = parser.parseSource(source, 'src/index.ts');
      expect(result.exports.length).toBeGreaterThan(0);
    });

    it('should handle empty source files', () => {
      const result = parser.parseSource('', 'src/empty.ts');
      expect(result.symbols).toEqual([]);
      expect(result.imports).toEqual([]);
      expect(result.exports).toEqual([]);
    });

    it('should handle complex TypeScript with generics', () => {
      const source = `
export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  return {
    get: () => state,
    set: (val: T) => { state = val; },
  };
}
`;
      const result = parser.parseSource(source, 'src/store.ts');
      const func = result.symbols.find((s) => s.name === 'createStore');

      expect(func).toBeDefined();
      expect(func!.kind).toBe('function');
    });

    it('should set lastIndexedAt to recent date', () => {
      const result = parser.parseSource('const x = 1;', 'src/test.ts');
      const now = Date.now();
      expect(result.lastIndexedAt.getTime()).toBeCloseTo(now, -2); // within ~100ms
    });
  });

  describe('extractSignatures', () => {
    it('should extract signatures from source code', () => {
      const source = `
export function foo(a: string): void {}
export function bar(b: number): boolean { return true; }
`;
      const signatures = parser.extractSignatures(source);
      expect(signatures.length).toBe(2);
      expect(signatures[0].name).toBe('foo');
      expect(signatures[1].name).toBe('bar');
    });
  });

  // ========================================================================
  // MULTI-LANGUAGE PARSING TESTS
  // ========================================================================

  describe('Python parsing', () => {
    it('should extract Python functions and classes', () => {
      const source = `
import os
from typing import Optional

class UserService:
    """Manages user operations"""

    def __init__(self, db):
        self.db = db

    def get_user(self, user_id: str) -> Optional[dict]:
        """Fetch user by ID"""
        return self.db.find(user_id)

    async def create_user(self, name: str) -> dict:
        return await self.db.insert(name)

def authenticate(token: str) -> bool:
    """Validates a JWT token"""
    return len(token) > 0
`;
      const result = parser.parseSource(source, 'src/service.py');

      expect(result.language).toBe('python');

      // Should find class
      const cls = result.symbols.find((s) => s.name === 'UserService');
      expect(cls).toBeDefined();
      expect(cls!.kind).toBe('class');
      expect(cls!.isExported).toBe(true);

      // Should find methods
      const getUser = result.symbols.find((s) => s.name === 'get_user');
      expect(getUser).toBeDefined();
      expect(getUser!.kind).toBe('method');
      expect(getUser!.parentSymbol).toBe('UserService');

      // Should find top-level function
      const auth = result.symbols.find((s) => s.name === 'authenticate');
      expect(auth).toBeDefined();
      expect(auth!.kind).toBe('function');
      expect(auth!.isExported).toBe(true);

      // Should find imports
      expect(result.imports).toContain('os');
    });

    it('should handle Python decorators', () => {
      const source = `
@app.route('/login')
def login(request):
    pass
`;
      const result = parser.parseSource(source, 'routes.py');
      const func = result.symbols.find((s) => s.name === 'login');
      expect(func).toBeDefined();
      expect(func!.signature).toContain('@app.route');
    });

    it('should detect private Python functions', () => {
      const source = `
def _internal_helper():
    pass

def public_function():
    pass
`;
      const result = parser.parseSource(source, 'utils.py');
      const internal = result.symbols.find((s) => s.name === '_internal_helper');
      expect(internal).toBeDefined();
      expect(internal!.isExported).toBe(false);

      const pub = result.symbols.find((s) => s.name === 'public_function');
      expect(pub!.isExported).toBe(true);
    });
  });

  describe('Go parsing', () => {
    it('should extract Go functions, structs, and interfaces', () => {
      const source = `
package main

import (
	"fmt"
	"net/http"
)

// Server handles HTTP requests
type Server struct {
	port int
	host string
}

// Handler interface for route handlers
type Handler interface {
	ServeHTTP(w http.ResponseWriter, r *http.Request)
}

// NewServer creates a new server instance
func NewServer(port int) *Server {
	return &Server{port: port}
}

// Start starts the server
func (s *Server) Start() error {
	return http.ListenAndServe(fmt.Sprintf(":%d", s.port), nil)
}

func internalHelper() {
	fmt.Println("hello")
}
`;
      const result = parser.parseSource(source, 'cmd/server/main.go');

      expect(result.language).toBe('go');

      // Struct
      const server = result.symbols.find((s) => s.name === 'Server');
      expect(server).toBeDefined();
      expect(server!.kind).toBe('class'); // struct maps to class
      expect(server!.isExported).toBe(true);

      // Interface
      const handler = result.symbols.find((s) => s.name === 'Handler');
      expect(handler).toBeDefined();
      expect(handler!.kind).toBe('interface');
      expect(handler!.isExported).toBe(true);

      // Exported function
      const newServer = result.symbols.find((s) => s.name === 'NewServer');
      expect(newServer).toBeDefined();
      expect(newServer!.kind).toBe('function');
      expect(newServer!.isExported).toBe(true);

      // Method with receiver
      const start = result.symbols.find((s) => s.name === 'Start');
      expect(start).toBeDefined();
      expect(start!.kind).toBe('method');
      expect(start!.parentSymbol).toBe('Server');

      // Unexported function (lowercase)
      const helper = result.symbols.find((s) => s.name === 'internalHelper');
      expect(helper).toBeDefined();
      expect(helper!.isExported).toBe(false);

      // Imports
      expect(result.imports).toContain('fmt');
      expect(result.imports).toContain('net/http');
    });
  });

  describe('Rust parsing', () => {
    it('should extract Rust functions, structs, traits, and impl blocks', () => {
      const source = `
use std::io;
use serde::Serialize;

/// A user in the system
pub struct User {
    pub name: String,
    age: u32,
}

pub enum Status {
    Active,
    Inactive,
}

/// Trait for serializable entities
pub trait Serializable {
    fn serialize(&self) -> String;
}

impl User {
    pub fn new(name: String) -> Self {
        User { name, age: 0 }
    }

    fn internal_method(&self) -> bool {
        true
    }
}

pub fn process_users(users: Vec<User>) -> Result<(), io::Error> {
    Ok(())
}
`;
      const result = parser.parseSource(source, 'src/models.rs');

      expect(result.language).toBe('rust');

      // Struct
      const user = result.symbols.find((s) => s.name === 'User' && s.kind === 'class');
      expect(user).toBeDefined();
      expect(user!.isExported).toBe(true);

      // Enum
      const status = result.symbols.find((s) => s.name === 'Status');
      expect(status).toBeDefined();
      expect(status!.kind).toBe('type'); // enum maps to type

      // Trait
      const ser = result.symbols.find((s) => s.name === 'Serializable');
      expect(ser).toBeDefined();
      expect(ser!.kind).toBe('interface'); // trait maps to interface

      // Impl methods
      const newFn = result.symbols.find((s) => s.name === 'new');
      expect(newFn).toBeDefined();
      expect(newFn!.kind).toBe('method');
      expect(newFn!.parentSymbol).toBe('User');

      // Public function
      const process = result.symbols.find((s) => s.name === 'process_users');
      expect(process).toBeDefined();
      expect(process!.kind).toBe('function');
      expect(process!.isExported).toBe(true);

      // Imports
      expect(result.imports).toContain('std::io');
    });
  });

  describe('Java parsing', () => {
    it('should extract Java classes, interfaces, and methods', () => {
      const source = `
import java.util.List;
import java.util.Optional;

/**
 * Service for managing users
 */
public class UserService {

    public Optional<User> findById(String id) {
        return Optional.empty();
    }

    private void validateUser(User user) {
        // validation
    }
}

public interface Repository {
    List<User> findAll();
}
`;
      const result = parser.parseSource(source, 'src/UserService.java');

      expect(result.language).toBe('java');

      // Class
      const cls = result.symbols.find((s) => s.name === 'UserService');
      expect(cls).toBeDefined();
      expect(cls!.kind).toBe('class');
      expect(cls!.isExported).toBe(true);

      // Method
      const findById = result.symbols.find((s) => s.name === 'findById');
      expect(findById).toBeDefined();
      expect(findById!.kind).toBe('method');
      expect(findById!.parentSymbol).toBe('UserService');

      // Interface
      const repo = result.symbols.find((s) => s.name === 'Repository');
      expect(repo).toBeDefined();
      expect(repo!.kind).toBe('interface');

      // Imports
      expect(result.imports).toContain('java.util.List');
    });
  });

  describe('Ruby parsing', () => {
    it('should extract Ruby classes, modules, and methods', () => {
      const source = `
require 'json'
require_relative 'helpers'

module Authentication
  class TokenValidator
    attr_reader :secret

    def initialize(secret)
      @secret = secret
    end

    def validate(token)
      token.length > 0
    end

    def self.default_validator
      new('default')
    end
  end
end

def standalone_helper
  puts "hello"
end
`;
      const result = parser.parseSource(source, 'lib/auth.rb');

      expect(result.language).toBe('ruby');

      // Module
      const mod = result.symbols.find((s) => s.name === 'Authentication');
      expect(mod).toBeDefined();
      expect(mod!.kind).toBe('class'); // module maps to class

      // Class
      const cls = result.symbols.find((s) => s.name === 'TokenValidator');
      expect(cls).toBeDefined();
      expect(cls!.kind).toBe('class');

      // Method
      const validate = result.symbols.find((s) => s.name === 'validate');
      expect(validate).toBeDefined();
      expect(validate!.kind).toBe('method');

      // Class method (self.*)
      const classMethod = result.symbols.find((s) => s.name === 'self.default_validator');
      expect(classMethod).toBeDefined();

      // attr_reader
      const secret = result.symbols.find((s) => s.name === 'secret');
      expect(secret).toBeDefined();
      expect(secret!.kind).toBe('variable');

      // Standalone function
      const helper = result.symbols.find((s) => s.name === 'standalone_helper');
      expect(helper).toBeDefined();
      expect(helper!.kind).toBe('function');

      // Imports
      expect(result.imports).toContain('json');
      expect(result.imports).toContain('helpers');
    });
  });

  describe('PHP parsing', () => {
    it('should extract PHP classes, interfaces, and functions', () => {
      const source = `
<?php
namespace App\\Services;

use App\\Models\\User;
use Illuminate\\Support\\Collection;

class UserService {
    public function findById(string $id): ?User {
        return User::find($id);
    }

    private function validate(User $user): bool {
        return true;
    }
}

interface Searchable {
    public function search(string $query): array;
}

function helper_function() {
    return true;
}
`;
      const result = parser.parseSource(source, 'app/Services/UserService.php');

      expect(result.language).toBe('php');

      // Class
      const cls = result.symbols.find((s) => s.name === 'UserService');
      expect(cls).toBeDefined();
      expect(cls!.kind).toBe('class');

      // Interface
      const iface = result.symbols.find((s) => s.name === 'Searchable');
      expect(iface).toBeDefined();
      expect(iface!.kind).toBe('interface');

      // Imports (use statements)
      expect(result.imports).toContain('App\\Models\\User');

      // Namespace
      expect(result.exports).toContain('App\\Services');
    });
  });
});
