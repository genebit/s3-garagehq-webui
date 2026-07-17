package schema

import "time"

type Role string

const (
	RoleOwner     Role = "owner"
	RoleAdmin     Role = "admin"
	RoleDeveloper Role = "developer"
)

func (r Role) IsValid() bool {
	switch r {
	case RoleOwner, RoleAdmin, RoleDeveloper:
		return true
	}
	return false
}

// CanManage reports whether the role is allowed to manage cluster resources
// (buckets, keys) and other users. Developers are not managers.
func (r Role) CanManage() bool {
	return r == RoleOwner || r == RoleAdmin
}

type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"passwordHash"`
	Role         Role      `json:"role"`
	Buckets      []string  `json:"buckets"`
	CreatedAt    time.Time `json:"createdAt"`
}

// PublicUser is the API-facing representation of a user, without the password hash.
type PublicUser struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	Role      Role      `json:"role"`
	Buckets   []string  `json:"buckets"`
	CreatedAt time.Time `json:"createdAt"`
}

func (u User) Public() PublicUser {
	buckets := u.Buckets
	if buckets == nil {
		buckets = []string{}
	}
	return PublicUser{
		ID:        u.ID,
		Username:  u.Username,
		Email:     u.Email,
		Role:      u.Role,
		Buckets:   buckets,
		CreatedAt: u.CreatedAt,
	}
}

func (u User) HasBucket(id string) bool {
	for _, b := range u.Buckets {
		if b == id {
			return true
		}
	}
	return false
}
