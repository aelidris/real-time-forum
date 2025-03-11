package auth

import (
    "fmt"
    "log"
    "regexp"
)

func ValidateInput(nickname, email, password, firstName, lastName string, age int, gender string) (map[string]string, bool) {
	errors := make(map[string]string)
	const maxNickname = 50
	const maxEmail = 100
	const maxPassword = 100
	const maxFirstName = 50
	const maxLastName = 50

	// Nickname validation
	if len(nickname) == 0 {
		errors["nickname"] = "Nickname cannot be empty"
	} else if len(nickname) > maxNickname {
		errors["nickname"] = fmt.Sprintf("Nickname cannot be longer than %d characters", maxNickname)
	}

	// Email validation
	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	if len(email) == 0 {
		errors["email"] = "Email cannot be empty"
	} else if len(email) > maxEmail {
		errors["email"] = fmt.Sprintf("Email cannot be longer than %d characters", maxEmail)
	} else if !emailRegex.MatchString(email) {
		errors["email"] = "Invalid email format"
	}

	// Password validation
	if len(password) < 8 {
		errors["password"] = "Password must be at least 8 characters long"
	} else if len(password) > maxPassword {
		errors["password"] = fmt.Sprintf("Password cannot be longer than %d characters", maxPassword)
	} else {
		hasUpper := regexp.MustCompile(`[A-Z]`).MatchString(password)
		hasLower := regexp.MustCompile(`[a-z]`).MatchString(password)
		hasDigit := regexp.MustCompile(`[0-9]`).MatchString(password)
		hasSpecial := regexp.MustCompile(`[\W_]`).MatchString(password)

		if !hasUpper {
			errors["password"] = "Password must include at least one uppercase letter"
		}
		if !hasLower {
			errors["password"] = "Password must include at least one lowercase letter"
		}
		if !hasDigit {
			errors["password"] = "Password must include at least one digit"
		}
		if !hasSpecial {
			errors["password"] = "Password must include at least one special character"
		}
	}

	// Name validation
	if len(firstName) == 0 {
		errors["first_name"] = "First name cannot be empty"
	} else if len(firstName) > maxFirstName {
		errors["first_name"] = fmt.Sprintf("First name cannot be longer than %d characters", maxFirstName)
	}

	if len(lastName) == 0 {
		errors["last_name"] = "Last name cannot be empty"
	} else if len(lastName) > maxLastName {
		errors["last_name"] = fmt.Sprintf("Last name cannot be longer than %d characters", maxLastName)
	}

	// Age validation
	if age < 0 || age > 150 {
		errors["age"] = "Age must be between 0 and 150"
	}

	// Gender validation
	if gender != "Male" && gender != "Female" {
		errors["gender"] = "Gender must be either 'Male' or 'Female'"
	}

	if len(errors) > 0 {
		log.Println("Validation errors:", errors)
		return errors, false
	}
	return nil, true
}