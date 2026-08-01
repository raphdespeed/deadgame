import pygame
import sys

# --- CONFIGURATION CONSTANTES ---
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
FPS = 60

# Physique (Valeurs calibrées pour un feeling Masocore)
GRAVITY = 0.4
TERMINAL_VELOCITY = 10.0
MOVE_SPEED = 3.0
JUMP_FORCE = -7.5
DOUBLE_JUMP_FORCE = -6.5

# Couleurs
COLOR_BG = (20, 20, 25)
COLOR_PLAYER = (0, 255, 100)
COLOR_WALL = (60, 60, 75)
COLOR_SPIKE = (255, 50, 50)

class Player:
    def __init__(self, x, y):
        self.spawn_x = x
        self.spawn_y = y
        # Sprite visible (32x32)
        self.rect = pygame.Rect(x, y, 32, 32)
        # Hitbox réduite pour la précision (padding de 4px)
        self.hitbox_padding = 4
        self.hitbox = self.rect.inflate(-self.hitbox_padding * 2, -self.hitbox_padding * 2)
        
        self.vel_y = 0
        self.on_ground = False
        self.can_double_jump = False
        
    def reset(self):
        """Réinitialisation instantanée (Reset system)"""
        self.rect.topleft = (self.spawn_x, self.spawn_y)
        self.vel_y = 0
        self.on_ground = False
        self.can_double_jump = False
        self.update_hitbox()

    def update_hitbox(self):
        """Synchronise la hitbox avec le rect visuel"""
        self.hitbox.center = self.rect.center

    def move(self, dx, walls):
        """Mouvement horizontal avec collision par étape (pixel-perfect)"""
        self.rect.x += dx
        self.update_hitbox()
        
        for wall in walls:
            if self.hitbox.colliderect(wall.rect):
                if dx > 0: # Collision droite
                    self.hitbox.right = wall.rect.left
                elif dx < 0: # Collision gauche
                    self.hitbox.left = wall.rect.right
                self.rect.centerx = self.hitbox.centerx

    def apply_gravity(self, walls):
        """Physique verticale et détection du sol"""
        self.vel_y += GRAVITY
        if self.vel_y > TERMINAL_VELOCITY:
            self.vel_y = TERMINAL_VELOCITY
            
        self.rect.y += self.vel_y
        self.update_hitbox()
        
        self.on_ground = False
        for wall in walls:
            if self.hitbox.colliderect(wall.rect):
                if self.vel_y > 0: # Chute
                    self.hitbox.bottom = wall.rect.top
                    self.vel_y = 0
                    self.on_ground = True
                    self.can_double_jump = True
                elif self.vel_y < 0: # Saut (plafond)
                    self.hitbox.top = wall.rect.bottom
                    self.vel_y = 0
                self.rect.centery = self.hitbox.centery

    def jump(self):
        if self.on_ground:
            self.vel_y = JUMP_FORCE
            self.on_ground = False
        elif self.can_double_jump:
            self.vel_y = DOUBLE_JUMP_FORCE
            self.can_double_jump = False

    def cut_jump(self):
        """Saut à hauteur variable : réduit la vélocité si on relâche la touche"""
        if self.vel_y < -2:
            self.vel_y = -2

    def draw(self, surface):
        # Dessine le sprite
        pygame.draw.rect(surface, COLOR_PLAYER, self.rect)
        # Debug: affiche la hitbox (optionnel)
        # pygame.draw.rect(surface, (255, 255, 255), self.hitbox, 1)

class Wall:
    def __init__(self, x, y, w, h):
        self.rect = pygame.Rect(x, y, w, h)

    def draw(self, surface):
        pygame.draw.rect(surface, COLOR_WALL, self.rect)

class Spike:
    def __init__(self, x, y, orientation='UP'):
        self.rect = pygame.Rect(x, y, 32, 32)
        self.orientation = orientation
        # Hitbox triangulaire simplifiée par un rect interne plus petit
        self.hitbox = self.rect.inflate(-8, -8)
        
    def draw(self, surface):
        x, y = self.rect.topleft
        if self.orientation == 'UP':
            points = [(x, y + 32), (x + 16, y), (x + 32, y + 32)]
        elif self.orientation == 'DOWN':
            points = [(x, y), (x + 16, y + 32), (x + 32, y)]
            
        pygame.draw.polygon(surface, COLOR_SPIKE, points)

def main():
    pygame.init()
    screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
    pygame.display.set_caption("Masocore Prototype - 60 FPS")
    clock = pygame.time.Clock()

    player = Player(100, 450)
    
    # --- LEVEL DESIGN ---
    walls = [
        Wall(0, 550, 800, 50),     # Sol
        Wall(0, 0, 50, 600),       # Mur gauche
        Wall(750, 0, 50, 600),     # Mur droit
        Wall(300, 450, 200, 32),   # Plateforme test
        Wall(550, 350, 150, 32),   # Plateforme haute
    ]
    
    hazards = [
        Spike(350, 418, 'UP'),     # Pointe sur plateforme
        Spike(382, 418, 'UP'),
        Spike(580, 518, 'UP'),     # Pointe au sol
        Spike(612, 518, 'UP'),
        Spike(550, 382, 'DOWN'),   # Pointe inversée
    ]

    while True:
        # 1. Gestion des événements
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_SHIFT or event.key == pygame.K_z or event.key == pygame.K_SPACE:
                    player.jump()
                if event.key == pygame.K_r: # Reset manuel
                    player.reset()
            
            if event.type == pygame.KEYUP:
                if event.key == pygame.K_SHIFT or event.key == pygame.K_z or event.key == pygame.K_SPACE:
                    player.cut_jump()

        # 2. Logique de mouvement
        keys = pygame.key.get_pressed()
        dx = 0
        if keys[pygame.K_LEFT]: dx -= MOVE_SPEED
        if keys[pygame.K_RIGHT]: dx += MOVE_SPEED
        
        player.move(dx, walls)
        player.apply_gravity(walls)

        # 3. Système de Mort (Hazard Collision)
        for spike in hazards:
            if player.hitbox.colliderect(spike.hitbox):
                player.reset()

        # 4. Affichage
        screen.fill(COLOR_BG)
        
        for wall in walls: wall.draw(screen)
        for spike in hazards: spike.draw(screen)
        player.draw(screen)

        pygame.display.flip()
        clock.tick(FPS) # Lock 60 FPS

if __name__ == "__main__":
    main()
